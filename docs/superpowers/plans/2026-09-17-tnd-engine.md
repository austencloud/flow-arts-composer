# TnD Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@tka/sequence-engine` can hold the two hands in any of the six Timing x Direction relations (Quarter included) and can hold the two props in a requested spin relation and phase, and it reports how well the props held.

**Architecture:** Four more location maps in `HandRelationshipConstraint`. A new hard `PropRelationshipConstraint` settles shift spins at candidate time; a `LeftSpinRule` (props first, else "match turns" plus a hand relationship) settles dash and static spins in the beam enrichment and in `postProcess`; a prop timing forces equal, non-float turns at allocation and derives the missing start orientation so the phase is set once and kept. A pure `prop-relationship.ts` module owns the bearing table, the phase law (same spin: difference; opposite spin: sum against South), the classifier, and the post-build report that `build()` attaches to `constraintReport`, retrying the search once on a miss.

**Tech Stack:** TypeScript, Vitest (`vitest run` in `packages/sequence-engine`), production CSV dataframes through `tests/helpers/csv-variations.ts`.

**Spec:** `docs/superpowers/specs/2026-09-17-tnd-card-design.md`, section "Engine".

**Worktree:** `E:/worktrees/tka-platform/tnd-engine` on branch `codex/tnd-engine`, created from `main` with `git worktree add E:/worktrees/tka-platform/tnd-engine -b codex/tnd-engine main`, then `MSYS_NO_PATHCONV=1 cmd /c "mklink /J E:\worktrees\tka-platform\tnd-engine\node_modules E:\tka-platform\node_modules"` (Git Bash) or the same `cmd /c mklink /J ...` from PowerShell. The engine package has no `node_modules` of its own in a worktree; `vitest` and `tsx` resolve up the tree through the junction, and `@tka/tka-types` resolves to the primary checkout's copy through `node_modules/@tka/tka-types`, which is identical to this branch's. Every command below runs from `E:/worktrees/tka-platform/tnd-engine/packages/sequence-engine` unless it says otherwise. Commit with explicit pathspecs only, from the worktree root or the package directory (paths relative to wherever you run `git`).

**Placement amendments to the spec, decided during planning:** the post-build report is computed in `build()` after any LOOP extension (so it covers the whole returned sequence) rather than in `postProcess`; the start-orientation derivation stays in `postProcess`. `TurnAllocator` and `TurnMaterializer` need no code change: `resolveTurnAllocationOptions` in the builder forces `matchHands` and `allowFloat: false` under a prop timing, and the builder passes `forcedRotationDirection` from the spin rule. The `matchedHandRelationship` option on `BeamSearch` and `postProcess` becomes a `leftSpinRule` function so the props-only path does not depend on a hand relationship.

---

## File map

| File                                                                               | Responsibility                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/loop/detection/pair-relation.ts` (modify)                                     | export the two rotate-90 tables                                                      |
| `src/generation/constraints/style/hand-relationship-constraint.ts` (modify)        | four Quarter maps, diagonal reflections flip spin                                    |
| `src/generation/prop-relationship.ts` (create)                                     | bearing table, phase law, classifier, partner orientation, post-build report         |
| `src/generation/constraints/style/prop-relationship-constraint.ts` (create)        | `PropRelationshipOptions`, candidate-time constraint, `propRelatedRotationDirection` |
| `src/generation/turns/left-spin-rule.ts` (create)                                  | `LeftSpinRule`, `resolveLeftSpinRule`                                                |
| `src/generation/constraints/constraint-types.ts` (modify)                          | `PROP_RELATIONSHIP`                                                                  |
| `src/generation/constraints/composition/constraint-options.ts` (modify)            | `propRelationship` option                                                            |
| `src/generation/constraints/composition/build-constraint-set.ts` (modify)          | push the hard constraint                                                             |
| `src/generation/builder/BeamSearch.ts` (modify)                                    | `leftSpinRule` option replaces `matchedHandRelationship`                             |
| `src/generation/builder/SequenceBuilder.ts` (modify)                               | allocation forcing, spin rule, start orientation derivation, report and retry        |
| `src/generation/index.ts` (modify)                                                 | exports                                                                              |
| `tests/generation/constraints/style/hand-relationship-constraint.test.ts` (modify) | Quarter map fixtures                                                                 |
| `tests/generation/prop-relationship.test.ts` (create)                              | bearing, phase, classifier, derivation, report                                       |
| `tests/generation/constraints/style/prop-relationship-constraint.test.ts` (create) | candidate rules                                                                      |
| `tests/generation/turns/left-spin-rule.test.ts` (create)                           | rule precedence                                                                      |
| `tests/generation/quarter-hand-relationship-build.test.ts` (create)                | Quarter maps through a build                                                         |
| `tests/generation/prop-relationship-build.test.ts` (create)                        | forcing, derivation, contradiction report, the One-or-both matrix                    |

---

### Task 1: Quarter hand maps

**Files:**

- Modify: `src/loop/detection/pair-relation.ts` (the export line at the bottom, near line 353)
- Modify: `src/generation/constraints/style/hand-relationship-constraint.ts` (lines 34 to 55)
- Test: `tests/generation/constraints/style/hand-relationship-constraint.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/generation/constraints/style/hand-relationship-constraint.test.ts`, after the last `describe` (the file already defines `motion(...)` and imports `handRelationshipHolds`; add `relatedRotationDirection` to that import):

```ts
describe("quarter maps", () => {
  // Right hand E to N: a counter-clockwise arc, pro follows the hand, so ccw.
  const right = motion("pro", "ccw", "e", "n");

  it("rotate-90-cw sends E>N onto S>E and keeps the spin", () => {
    const map = "rotate-90-cw" as const;
    expect(
      handRelationshipHolds(motion("pro", "ccw", "s", "e"), right, { map })
    ).toBe(true);
    expect(
      handRelationshipHolds(motion("pro", "cw", "s", "e"), right, { map })
    ).toBe(false);
    expect(
      handRelationshipHolds(motion("pro", "ccw", "n", "w"), right, { map })
    ).toBe(false);
    expect(
      handRelationshipHolds(motion("anti", "cw", "s", "e"), right, {
        map,
        inverted: true,
      })
    ).toBe(true);
  });

  it("rotate-90-ccw sends E>N onto N>W and keeps the spin", () => {
    const map = "rotate-90-ccw" as const;
    expect(
      handRelationshipHolds(motion("pro", "ccw", "n", "w"), right, { map })
    ).toBe(true);
    expect(
      handRelationshipHolds(motion("pro", "cw", "n", "w"), right, { map })
    ).toBe(false);
  });

  it("reflect-northeast-southwest sends E>N onto N>E and flips the spin", () => {
    const map = "reflect-northeast-southwest" as const;
    expect(
      handRelationshipHolds(motion("pro", "cw", "n", "e"), right, { map })
    ).toBe(true);
    expect(
      handRelationshipHolds(motion("pro", "ccw", "n", "e"), right, { map })
    ).toBe(false);
    expect(
      handRelationshipHolds(motion("anti", "ccw", "n", "e"), right, {
        map,
        inverted: true,
      })
    ).toBe(true);
  });

  it("reflect-northwest-southeast sends E>N onto S>W and flips the spin", () => {
    const map = "reflect-northwest-southeast" as const;
    expect(
      handRelationshipHolds(motion("pro", "cw", "s", "w"), right, { map })
    ).toBe(true);
    expect(
      handRelationshipHolds(motion("pro", "ccw", "s", "w"), right, { map })
    ).toBe(false);
  });

  it("relatedRotationDirection flips for the diagonal reflections only", () => {
    expect(relatedRotationDirection("cw", { map: "rotate-90-cw" })).toBe("cw");
    expect(relatedRotationDirection("cw", { map: "rotate-90-ccw" })).toBe("cw");
    expect(
      relatedRotationDirection("cw", { map: "reflect-northeast-southwest" })
    ).toBe("ccw");
    expect(
      relatedRotationDirection("cw", {
        map: "reflect-northwest-southeast",
        inverted: true,
      })
    ).toBe("cw");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/generation/constraints/style/hand-relationship-constraint.test.ts`
Expected: FAIL. The new map names are not in `HAND_RELATIONSHIP_LOCATION_MAPS`, so `handRelationshipHolds` reads `map[...]` on `undefined` (TypeError) or returns false.

- [ ] **Step 3: Export the rotate-90 tables**

In `src/loop/detection/pair-relation.ts` replace the last export line with:

```ts
// The location tables that are not reflections, exported for the per-step
// hand relationship constraint so it does not keep its own copies.
export {
  IDENTITY as IDENTITY_LOCATION_MAP,
  ROTATE_180 as ROTATE_180_LOCATION_MAP,
  ROTATE_90_CW as ROTATE_90_CW_LOCATION_MAP,
  ROTATE_90_CCW as ROTATE_90_CCW_LOCATION_MAP,
};
```

- [ ] **Step 4: Add the maps to the constraint**

In `src/generation/constraints/style/hand-relationship-constraint.ts`:

```ts
import {
  IDENTITY_LOCATION_MAP,
  ROTATE_180_LOCATION_MAP,
  ROTATE_90_CW_LOCATION_MAP,
  ROTATE_90_CCW_LOCATION_MAP,
} from "../../../loop/detection/pair-relation.js";

/**
 * The six Timing x Direction relations as location maps. Together Same is
 * identity, Together Opposite the north-south reflection, Split Same the
 * half turn, Split Opposite the east-west reflection. Quarter Same is a
 * quarter turn in either sense and Quarter Opposite a reflection on either
 * diagonal; the caller picks the sense or the axis.
 */
export type HandRelationshipMap =
  | "identity"
  | "rotate-180"
  | "rotate-90-cw"
  | "rotate-90-ccw"
  | "reflect-north-south"
  | "reflect-east-west"
  | "reflect-northeast-southwest"
  | "reflect-northwest-southeast";
```

```ts
export const HAND_RELATIONSHIP_LOCATION_MAPS: Readonly<
  Record<HandRelationshipMap, Readonly<Record<string, string>>>
> = {
  identity: IDENTITY_LOCATION_MAP,
  "rotate-180": ROTATE_180_LOCATION_MAP,
  "rotate-90-cw": ROTATE_90_CW_LOCATION_MAP,
  "rotate-90-ccw": ROTATE_90_CCW_LOCATION_MAP,
  "reflect-north-south": REFLECTION_LOCATION_MAPS["north-south"],
  "reflect-east-west": REFLECTION_LOCATION_MAPS["east-west"],
  "reflect-northeast-southwest":
    REFLECTION_LOCATION_MAPS["northeast-southwest"],
  "reflect-northwest-southeast":
    REFLECTION_LOCATION_MAPS["northwest-southeast"],
};

const REFLECTIONS: ReadonlySet<HandRelationshipMap> = new Set([
  "reflect-north-south",
  "reflect-east-west",
  "reflect-northeast-southwest",
  "reflect-northwest-southeast",
]);

/** Whether the map flips the hand path (and so the natural spin). */
export function isReflectionMap(map: HandRelationshipMap): boolean {
  return REFLECTIONS.has(map);
}
```

Replace the two internal `REFLECTIONS.has(...)` reads with `isReflectionMap(...)` or leave them; both are fine. Export `isReflectionMap` from `src/generation/index.ts` in the same block as `handRelationshipHolds` (the app's derived-inversion code in the companion plan uses it).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/generation/constraints/style/hand-relationship-constraint.test.ts tests/generation/hand-relationship-build.test.ts`
Expected: PASS, including the pre-existing LOOP matrix in the build test (the four existing maps are untouched).

- [ ] **Step 6: Commit** (from the worktree root `E:/worktrees/tka-platform/tnd-engine`)

```bash
git commit -m "feat(engine): quarter-turn and diagonal hand relationship maps" -- packages/sequence-engine/src/loop/detection/pair-relation.ts packages/sequence-engine/src/generation/constraints/style/hand-relationship-constraint.ts packages/sequence-engine/src/generation/index.ts packages/sequence-engine/tests/generation/constraints/style/hand-relationship-constraint.test.ts
```

---

### Task 2: `prop-relationship.ts`: bearing table, phase law, classifier, derivation, report

**Files:**

- Create: `src/generation/prop-relationship.ts`
- Test: `tests/generation/prop-relationship.test.ts`

Background for the implementer. A prop's bearing is the angle its head points at, taken from the grid location angle and the radial orientation: `bearing(orientation, location) = angle(location) + pi - k * pi/4` with `k` the orientation's index in `["in","clockIn","clock","clockOut","out","counterOut","counter","counterIn"]`. Location angles are `e 0, s pi/2, w pi, n -pi/2, ne -pi/4, se pi/4, sw 3pi/4, nw 5pi/4` (the app's `LOCATION_ANGLES`; the companion plan adds a 64-pair parity test against the app's `mapOrientationToAngle`). The phase between the props is the quantity equal turns keep constant: with the same spin it is `b_L - b_R`; with opposite spin it is `b_L + b_R - pi`, which is zero when both props point South at once (the downbeat). Timing classes: Together within pi/4 of 0, Split within pi/4 of pi, Quarter otherwise.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/generation/prop-relationship.test.ts
import { describe, expect, it } from "vitest";
import {
  classifyPropRelationship,
  derivePartnerOrientation,
  LOCATION_BEARINGS,
  propBearing,
  propPhase,
  RADIAL_ORIENTATION_CYCLE,
  reportPropRelationship,
  timingFromPhase,
  type PropRelationshipMotion,
} from "../../src/generation/prop-relationship.js";

const PI = Math.PI;
const near = (a: number, b: number) =>
  Math.abs(((((a - b) % (2 * PI)) + 3 * PI) % (2 * PI)) - PI) < 1e-9;

function motion(
  overrides: Partial<PropRelationshipMotion> = {}
): PropRelationshipMotion {
  return {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "n",
    endLocation: "e",
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
    ...overrides,
  };
}

describe("propBearing", () => {
  it("points in toward the center for the in orientation", () => {
    expect(near(propBearing("in", "e")!, PI)).toBe(true);
    expect(near(propBearing("in", "n")!, PI / 2)).toBe(true);
  });

  it("steps a quarter turn per radial orientation", () => {
    expect(near(propBearing("clock", "e")!, PI / 2)).toBe(true);
    expect(near(propBearing("out", "e")!, 0)).toBe(true);
    expect(near(propBearing("counter", "e")!, -PI / 2)).toBe(true);
  });

  it("is undefined off the table", () => {
    expect(propBearing("centerN", "e")).toBeUndefined();
    expect(propBearing("in", "center")).toBeUndefined();
  });

  it("covers every location and every radial orientation", () => {
    for (const location of Object.keys(LOCATION_BEARINGS)) {
      for (const orientation of RADIAL_ORIENTATION_CYCLE) {
        expect(propBearing(orientation, location)).toBeTypeOf("number");
      }
    }
  });
});

describe("propPhase and timingFromPhase", () => {
  it("reads the difference under the same spin", () => {
    expect(near(propPhase(PI / 2, PI / 2, "same"), 0)).toBe(true);
    expect(near(propPhase(PI, 0, "same"), PI)).toBe(true);
  });

  it("reads the sum against South under opposite spin", () => {
    // Both point South: together.
    expect(near(propPhase(PI / 2, PI / 2, "opp"), 0)).toBe(true);
    // One South, one North: split.
    expect(near(propPhase(PI / 2, -PI / 2, "opp"), PI)).toBe(true);
  });

  it("classes the phase with quarter bands", () => {
    expect(timingFromPhase(0)).toBe("tog");
    expect(timingFromPhase(PI / 8)).toBe("tog");
    expect(timingFromPhase(PI / 2)).toBe("quarter");
    expect(timingFromPhase(-PI / 2)).toBe("quarter");
    expect(timingFromPhase(PI)).toBe("split");
    expect(timingFromPhase(PI + PI / 8)).toBe("split");
  });
});

describe("classifyPropRelationship", () => {
  it("is float when either prop is not spinning", () => {
    expect(
      classifyPropRelationship(
        motion({ motionType: "dash", rotationDirection: "noRotation" }),
        motion()
      )
    ).toEqual({ kind: "float" });
    expect(
      classifyPropRelationship(
        motion({
          motionType: "float",
          turns: "fl",
          rotationDirection: "noRotation",
        }),
        motion()
      )
    ).toEqual({ kind: "float" });
  });

  it("reads Together Same for two in props on the same arc", () => {
    // Both hands N to E, both in, both cw: same bearing throughout.
    expect(classifyPropRelationship(motion(), motion())).toEqual({
      kind: "full",
      direction: "same",
      timing: "tog",
    });
  });

  it("reads Split Same for in against out on the same arc", () => {
    expect(
      classifyPropRelationship(
        motion({ startOrientation: "out", endOrientation: "out" }),
        motion()
      )
    ).toEqual({ kind: "full", direction: "same", timing: "split" });
  });

  it("reads Together Opposite when the bearings sum to South twice", () => {
    // Left at N pointing in (South, pi/2), right at S pointing in (North,
    // -pi/2): sum is 0, minus pi is -pi: split. Flip the right to out
    // (South): sum is pi, together.
    const left = motion({
      startLocation: "n",
      endLocation: "n",
      rotationDirection: "ccw",
    });
    const rightIn = motion({ startLocation: "s", endLocation: "s" });
    const rightOut = motion({
      startLocation: "s",
      endLocation: "s",
      startOrientation: "out",
      endOrientation: "out",
    });
    expect(classifyPropRelationship(left, rightIn)).toEqual({
      kind: "full",
      direction: "opp",
      timing: "split",
    });
    expect(classifyPropRelationship(left, rightOut)).toEqual({
      kind: "full",
      direction: "opp",
      timing: "tog",
    });
  });

  it("is direction-only when the start and end phases disagree", () => {
    expect(
      classifyPropRelationship(motion({ endOrientation: "out" }), motion())
    ).toEqual({ kind: "direction-only", direction: "same" });
  });
});

describe("derivePartnerOrientation", () => {
  it("round-trips through the classifier for every radial pair", () => {
    const locations = ["n", "e", "s", "w"];
    for (const direction of ["same", "opp"] as const) {
      for (const timing of ["tog", "quarter", "split"] as const) {
        for (const rightLocation of locations) {
          for (const leftLocation of locations) {
            for (const rightOrientation of ["in", "out", "clock", "counter"]) {
              const left = derivePartnerOrientation(
                { orientation: rightOrientation, location: rightLocation },
                leftLocation,
                direction,
                timing
              );
              expect(
                left,
                `${direction} ${timing} R ${rightOrientation}@${rightLocation} L@${leftLocation}`
              ).toBeDefined();
              expect(["in", "out", "clock", "counter"]).toContain(left);
              const reading = classifyPropRelationship(
                motion({
                  startLocation: leftLocation,
                  endLocation: leftLocation,
                  startOrientation: left!,
                  endOrientation: left!,
                  rotationDirection: direction === "same" ? "cw" : "ccw",
                }),
                motion({
                  startLocation: rightLocation,
                  endLocation: rightLocation,
                  startOrientation: rightOrientation,
                  endOrientation: rightOrientation,
                })
              );
              expect(reading).toEqual({ kind: "full", direction, timing });
            }
          }
        }
      }
    }
  });

  it("lands on a radial-four orientation from a diagonal pair too", () => {
    const left = derivePartnerOrientation(
      { orientation: "in", location: "ne" },
      "sw",
      "opp",
      "quarter"
    );
    expect(["in", "out", "clock", "counter"]).toContain(left);
  });
});

describe("reportPropRelationship", () => {
  const start = {
    motions: {
      left: motion({ motionType: "static" }),
      right: motion({ motionType: "static" }),
    },
  };
  it("counts holding, offending and exempt beats and names the first miss", () => {
    const hold = { motions: { left: motion(), right: motion() } };
    const miss = {
      motions: {
        left: motion({ startOrientation: "out", endOrientation: "out" }),
        right: motion(),
      },
    };
    const exempt = {
      motions: {
        left: motion({ motionType: "dash", rotationDirection: "noRotation" }),
        right: motion(),
      },
    };
    const report = reportPropRelationship([start, hold, exempt, miss, hold], {
      direction: "same",
      timing: "tog",
    });
    expect(report).toEqual({
      holding: 2,
      offending: 1,
      exempt: 1,
      firstOffendingIndex: 3,
    });
  });

  it("checks direction alone when no timing is requested", () => {
    const split = {
      motions: {
        left: motion({ startOrientation: "out", endOrientation: "out" }),
        right: motion(),
      },
    };
    expect(
      reportPropRelationship([start, split], { direction: "same" }).offending
    ).toBe(0);
    expect(
      reportPropRelationship([start, split], { direction: "opp" }).offending
    ).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/generation/prop-relationship.test.ts`
Expected: FAIL, cannot resolve `../../src/generation/prop-relationship.js`.

- [ ] **Step 3: Write the module**

```ts
// src/generation/prop-relationship.ts
/**
 * Prop relationship: how the two props relate in spin and in phase.
 *
 * Direction is whether the props spin the same way or opposite ways. Timing
 * is where they sit in their circles relative to each other: Together, Split
 * or Quarter. The phase is the one number equal turns keep constant. With the
 * same spin both bearings advance together, so their difference is fixed.
 * With opposite spin they advance against each other, so their sum is fixed;
 * measured against South (both props pointing down at once, the downbeat)
 * that sum reads Together at zero.
 *
 * Bearings come from the grid location angle and the radial orientation, the
 * same numbers the app's angle-calculator and orientation-angle modules use;
 * the app delegates its classifier here so every surface reads one answer.
 */

const PI = Math.PI;
const TAU = 2 * Math.PI;

export type PropDirection = "same" | "opp";
export type PropTiming = "tog" | "split" | "quarter";

/** Angle of each grid location, radians, e at 0 and s at +pi/2 (screen space). */
export const LOCATION_BEARINGS: Readonly<Record<string, number>> = {
  e: 0,
  s: PI / 2,
  w: PI,
  n: -PI / 2,
  ne: -PI / 4,
  se: PI / 4,
  sw: (3 * PI) / 4,
  nw: (5 * PI) / 4,
};

/** Radial orientations in the order that turns the prop by 45 degrees. */
export const RADIAL_ORIENTATION_CYCLE = [
  "in",
  "clockIn",
  "clock",
  "clockOut",
  "out",
  "counterOut",
  "counter",
  "counterIn",
] as const;

/** The phase each timing sits at. Quarter is a quarter turn either way. */
export const PROP_TIMING_PHASE: Readonly<Record<PropTiming, number>> = {
  tog: 0,
  quarter: PI / 2,
  split: PI,
};

export interface PropRelationshipMotion {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  startOrientation: string;
  endOrientation: string;
  turns?: number | "fl";
}

export type PropRelationshipReading =
  | { kind: "float" }
  | { kind: "direction-only"; direction: PropDirection }
  | { kind: "full"; direction: PropDirection; timing: PropTiming };

export interface PropRelationshipReport {
  /** Beats whose reading matches the request. */
  holding: number;
  /** Beats that read as a different direction or timing. */
  offending: number;
  /** Beats with no prop relation (a float, or an unturned dash or static). */
  exempt: number;
  /** Sequence index (start placement is 0) of the first offending beat. */
  firstOffendingIndex: number | null;
}

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export function normalizeAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/**
 * Where the prop's head points for a radial orientation at a location.
 * Undefined for a centric orientation or a location off the grid.
 */
export function propBearing(
  orientation: string,
  location: string
): number | undefined {
  const center = LOCATION_BEARINGS[lower(location)];
  if (center === undefined) return undefined;
  const k = (RADIAL_ORIENTATION_CYCLE as readonly string[]).indexOf(
    orientation
  );
  if (k === -1) return undefined;
  return normalizeAngle(center + PI - k * (PI / 4));
}

/** The phase between two bearings under a spin relation, in [0, 2pi). */
export function propPhase(
  leftBearing: number,
  rightBearing: number,
  direction: PropDirection
): number {
  return normalizeAngle(
    direction === "same"
      ? leftBearing - rightBearing
      : leftBearing + rightBearing - PI
  );
}

/** Together within a quarter turn of zero, Split within a quarter of half. */
export function timingFromPhase(phase: number): PropTiming {
  const wrapped = normalizeAngle(phase);
  const folded = Math.min(wrapped, TAU - wrapped);
  if (folded < PI / 4) return "tog";
  if (folded > (3 * PI) / 4) return "split";
  return "quarter";
}

function spinOf(motion: PropRelationshipMotion): "cw" | "ccw" | undefined {
  if (motion.turns === "fl" || lower(motion.motionType) === "float") {
    return undefined;
  }
  const direction = lower(motion.rotationDirection);
  return direction === "cw" || direction === "ccw" ? direction : undefined;
}

/**
 * Read one beat. Float when either prop is not spinning (nothing to relate);
 * direction-only when a bearing is off the table or the beat starts in one
 * timing class and ends in another; full otherwise.
 */
export function classifyPropRelationship(
  left: PropRelationshipMotion,
  right: PropRelationshipMotion
): PropRelationshipReading {
  const leftSpin = spinOf(left);
  const rightSpin = spinOf(right);
  if (!leftSpin || !rightSpin) return { kind: "float" };
  const direction: PropDirection = leftSpin === rightSpin ? "same" : "opp";

  const startLeft = propBearing(left.startOrientation, left.startLocation);
  const startRight = propBearing(right.startOrientation, right.startLocation);
  const endLeft = propBearing(left.endOrientation, left.endLocation);
  const endRight = propBearing(right.endOrientation, right.endLocation);
  if (
    startLeft === undefined ||
    startRight === undefined ||
    endLeft === undefined ||
    endRight === undefined
  ) {
    return { kind: "direction-only", direction };
  }

  const startTiming = timingFromPhase(
    propPhase(startLeft, startRight, direction)
  );
  const endTiming = timingFromPhase(propPhase(endLeft, endRight, direction));
  if (startTiming !== endTiming) return { kind: "direction-only", direction };
  return { kind: "full", direction, timing: startTiming };
}

/**
 * The orientation that puts a prop at `leftLocation` in the requested phase
 * with a partner at `right`, or undefined when no radial orientation lands
 * there. Symmetric enough to derive either hand from the other: Together and
 * Split are their own mirror, and Quarter is a quarter either way.
 */
export function derivePartnerOrientation(
  right: { orientation: string; location: string },
  leftLocation: string,
  direction: PropDirection,
  timing: PropTiming
): string | undefined {
  const rightBearing = propBearing(right.orientation, right.location);
  const leftCenter = LOCATION_BEARINGS[lower(leftLocation)];
  if (rightBearing === undefined || leftCenter === undefined) return undefined;
  const phase = PROP_TIMING_PHASE[timing];
  const leftBearing =
    direction === "same" ? rightBearing + phase : PI - rightBearing + phase;
  // bearing = center + pi - k * pi/4, solved for k.
  const raw = normalizeAngle(leftCenter + PI - leftBearing) / (PI / 4);
  const k = Math.round(raw);
  if (Math.abs(raw - k) > 1e-6) return undefined;
  return RADIAL_ORIENTATION_CYCLE[k % 8];
}

/**
 * Score a whole sequence (index 0 is the start placement and is skipped)
 * against a requested relation. Without a timing only the direction counts.
 */
export function reportPropRelationship(
  steps: ReadonlyArray<{
    motions: { left: PropRelationshipMotion; right: PropRelationshipMotion };
  }>,
  request: { direction: PropDirection; timing?: PropTiming }
): PropRelationshipReport {
  let holding = 0;
  let offending = 0;
  let exempt = 0;
  let firstOffendingIndex: number | null = null;
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]!;
    const reading = classifyPropRelationship(
      step.motions.left,
      step.motions.right
    );
    if (reading.kind === "float") {
      exempt++;
      continue;
    }
    const holds =
      reading.direction === request.direction &&
      (request.timing === undefined ||
        (reading.kind === "full" && reading.timing === request.timing));
    if (holds) {
      holding++;
    } else {
      offending++;
      firstOffendingIndex ??= i;
    }
  }
  return { holding, offending, exempt, firstOffendingIndex };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/generation/prop-relationship.test.ts`
Expected: PASS. If the "reads Together Opposite" case fails, recheck the fixture against the bearing formula before touching the module: left `in` at `n` is `-pi/2 + pi = pi/2` (South), right `in` at `s` is `pi/2 + pi = 3pi/2` (North), right `out` at `s` (k = 4) is `pi/2 + pi - pi = pi/2` (South).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(engine): prop relationship bearings, phase law, classifier and report" -- packages/sequence-engine/src/generation/prop-relationship.ts packages/sequence-engine/tests/generation/prop-relationship.test.ts
```

---

### Task 3: `PropRelationshipConstraint` and the option plumbing

**Files:**

- Create: `src/generation/constraints/style/prop-relationship-constraint.ts`
- Modify: `src/generation/constraints/constraint-types.ts` (after `HAND_RELATIONSHIP`)
- Modify: `src/generation/constraints/composition/constraint-options.ts` (after `handRelationship`)
- Modify: `src/generation/constraints/composition/build-constraint-set.ts` (after the `handRelationship` push near line 135)
- Test: `tests/generation/constraints/style/prop-relationship-constraint.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/generation/constraints/style/prop-relationship-constraint.test.ts
import { describe, expect, it } from "vitest";
import {
  PropRelationshipConstraint,
  propRelatedRotationDirection,
  propRelationshipCouldHold,
} from "../../../../src/generation/constraints/style/prop-relationship-constraint.js";
import { ConstraintType } from "../../../../src/generation/constraints/constraint-types.js";
import { buildConstraintSet } from "../../../../src/generation/constraints/composition/build-constraint-set.js";
import type {
  ConstraintContext,
  MotionData,
  PictographData,
} from "../../../../src/generation/constraints/types.js";

function motion(
  motionType: string,
  rotationDirection: string,
  start = "n",
  end = "e"
): MotionData {
  return {
    motionType,
    rotationDirection,
    startLocation: start,
    endLocation: end,
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
  } as unknown as MotionData;
}

function candidate(left: MotionData, right: MotionData): PictographData {
  return {
    letter: "?",
    startPlacement: "?",
    endPlacement: "?",
    timing: "split",
    direction: "same",
    leftMotion: left,
    rightMotion: right,
  };
}

const proCw = motion("pro", "cw");
const proCcw = motion("pro", "ccw");
const dash = motion("dash", "noRotation");
const stat = motion("static", "noRotation", "n", "n");

describe("propRelationshipCouldHold", () => {
  it("checks the spin relation of two shifts", () => {
    expect(
      propRelationshipCouldHold(candidate(proCw, proCw), { direction: "same" })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(proCw, proCcw), { direction: "same" })
    ).toBe(false);
    expect(
      propRelationshipCouldHold(candidate(proCw, proCcw), { direction: "opp" })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(proCw, proCw), { direction: "opp" })
    ).toBe(false);
  });

  it("passes dash and static pairs through: their spin is settled later", () => {
    expect(
      propRelationshipCouldHold(candidate(dash, dash), { direction: "opp" })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(stat, stat), { direction: "same" })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(dash, proCw), { direction: "same" })
    ).toBe(true);
  });

  it("rejects a shift paired with a dash or static once a timing is set", () => {
    expect(
      propRelationshipCouldHold(candidate(dash, proCw), {
        direction: "same",
        timing: "tog",
      })
    ).toBe(false);
    expect(
      propRelationshipCouldHold(candidate(proCw, stat), {
        direction: "same",
        timing: "split",
      })
    ).toBe(false);
    expect(
      propRelationshipCouldHold(candidate(dash, stat), {
        direction: "same",
        timing: "tog",
      })
    ).toBe(true);
    expect(
      propRelationshipCouldHold(candidate(proCw, proCw), {
        direction: "same",
        timing: "tog",
      })
    ).toBe(true);
  });
});

describe("PropRelationshipConstraint", () => {
  it("is a hard variation constraint that scores what couldSatisfy says", () => {
    const constraint = new PropRelationshipConstraint({ direction: "opp" });
    expect(constraint.type).toBe(ConstraintType.PROP_RELATIONSHIP);
    expect(constraint.mode).toBe("hard");
    const ok: ConstraintContext = {
      stepIndex: 0,
      totalSteps: 2,
      previousSteps: [],
      letter: "?",
      candidate: candidate(proCw, proCcw),
    };
    expect(constraint.evaluate(ok).satisfied).toBe(true);
    expect(constraint.couldSatisfy(candidate(proCw, proCw))).toBe(false);
  });

  it("is added to the hard set by buildConstraintSet", () => {
    const set = buildConstraintSet({ propRelationship: { direction: "same" } });
    expect(
      set.hard.some((c) => c.type === ConstraintType.PROP_RELATIONSHIP)
    ).toBe(true);
    expect(
      buildConstraintSet({}).hard.some(
        (c) => c.type === ConstraintType.PROP_RELATIONSHIP
      )
    ).toBe(false);
  });
});

describe("propRelatedRotationDirection", () => {
  it("copies or flips the right hand's spin", () => {
    expect(propRelatedRotationDirection("cw", "same")).toBe("cw");
    expect(propRelatedRotationDirection("cw", "opp")).toBe("ccw");
    expect(propRelatedRotationDirection("ccw", "opp")).toBe("cw");
    expect(propRelatedRotationDirection("noRotation", "opp")).toBeUndefined();
    expect(propRelatedRotationDirection(undefined, "same")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/generation/constraints/style/prop-relationship-constraint.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Enum and options**

`constraint-types.ts`, after `HAND_RELATIONSHIP = "handRelationship",`:

```ts
  /** The two props spin in a requested relation (same or opposite, and a timing). */
  PROP_RELATIONSHIP = "propRelationship",
```

`constraint-options.ts`: add the import and the field.

```ts
import type { PropRelationshipOptions } from "../style/prop-relationship-constraint.js";
```

```ts
  /** Tie the props' spins (and, with a timing, their phase) together. Hard.
   *  See PropRelationshipConstraint and generation/prop-relationship.ts. */
  propRelationship?: PropRelationshipOptions;
```

`build-constraint-set.ts`: add the import and, after the `handRelationship` push:

```ts
import { PropRelationshipConstraint } from "../style/prop-relationship-constraint.js";
```

```ts
if (options.propRelationship) {
  hard.push(new PropRelationshipConstraint(options.propRelationship));
}
```

- [ ] **Step 4: Write the constraint**

```ts
// src/generation/constraints/style/prop-relationship-constraint.ts
/**
 * Prop Relationship Constraint
 *
 * Holds the two props in a requested spin relation inside one step, and with
 * a timing keeps the step from drifting the props' phase.
 *
 * A shift's spin is fixed by the dataset (pro or anti on a given hand path),
 * so two shifts can be checked per candidate. A dash or static gets its spin
 * from turns later; the builder forces that spin from the right hand through
 * the LeftSpinRule, so those pairs pass here.
 *
 * With a timing set, a shift paired with a dash or static is rejected: a
 * shift moves the prop a quarter turn plus its turns, a dash or static only
 * its turns, so the pair changes the phase by a quarter and the timing would
 * not survive the step. Equal turns (forced at allocation) keep everything
 * else invariant. See generation/prop-relationship.ts for the phase law.
 */

import { ConstraintType, type ConstraintMode } from "../constraint-types.js";
import type {
  IVariationConstraint,
  ConstraintContext,
  ConstraintScore,
  PictographData,
} from "../types.js";
import type { PropDirection, PropTiming } from "../../prop-relationship.js";

export interface PropRelationshipOptions {
  /** Same spin or opposite spin. */
  direction: PropDirection;
  /** Together, Split or Quarter. Absent: direction only. */
  timing?: PropTiming;
}

const SHIFTS = new Set(["pro", "anti"]);

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

/**
 * The spin the left prop takes once the right prop's is known. Undefined when
 * the right prop is not spinning (nothing to relate to).
 */
export function propRelatedRotationDirection(
  rightDirection: string | undefined,
  direction: PropDirection
): "cw" | "ccw" | undefined {
  const r = lower(rightDirection);
  if (r !== "cw" && r !== "ccw") return undefined;
  if (direction === "same") return r;
  return r === "cw" ? "ccw" : "cw";
}

/** Whether this dataset row can carry the relation once turns are applied. */
export function propRelationshipCouldHold(
  candidate: PictographData,
  options: PropRelationshipOptions
): boolean {
  const left = candidate.leftMotion;
  const right = candidate.rightMotion;
  const leftShift = SHIFTS.has(lower(left.motionType));
  const rightShift = SHIFTS.has(lower(right.motionType));
  if (options.timing && leftShift !== rightShift) return false;
  if (!leftShift || !rightShift) return true;
  const same = lower(left.rotationDirection) === lower(right.rotationDirection);
  return options.direction === "same" ? same : !same;
}

export class PropRelationshipConstraint implements IVariationConstraint {
  readonly type = ConstraintType.PROP_RELATIONSHIP;
  readonly mode: ConstraintMode = "hard";
  readonly description: string;

  constructor(private readonly options: PropRelationshipOptions) {
    this.description = `Props spin ${options.direction}${
      options.timing ? ` and sit ${options.timing}` : ""
    }`;
  }

  evaluate(context: ConstraintContext): ConstraintScore {
    const ok = this.couldSatisfy(context.candidate);
    return {
      score: ok ? 1 : 0,
      satisfied: ok,
      reason: ok
        ? `Props relate ${this.options.direction}`
        : `Props cannot spin ${this.options.direction} on this step`,
    };
  }

  couldSatisfy(candidate: PictographData): boolean {
    return propRelationshipCouldHold(candidate, this.options);
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/generation/constraints/style/prop-relationship-constraint.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(engine): PropRelationshipConstraint and the propRelationship option" -- packages/sequence-engine/src/generation/constraints/style/prop-relationship-constraint.ts packages/sequence-engine/src/generation/constraints/constraint-types.ts packages/sequence-engine/src/generation/constraints/composition/constraint-options.ts packages/sequence-engine/src/generation/constraints/composition/build-constraint-set.ts packages/sequence-engine/tests/generation/constraints/style/prop-relationship-constraint.test.ts
```

---

### Task 4: `LeftSpinRule` in the beam search and the builder

**Files:**

- Create: `src/generation/turns/left-spin-rule.ts`
- Modify: `src/generation/builder/BeamSearch.ts` (imports near line 42, `enrichWithTurns` near lines 60 to 96, the options type near line 236, the three call sites near lines 362, 448, 657)
- Modify: `src/generation/builder/SequenceBuilder.ts` (`resolveMatchedHandRelationship` near line 228; the three `new BeamSearch(` sites near lines 846, 1140, 1265; the two `postProcess(` calls near lines 904 and 1340; the `postProcess` signature near line 1515 and its `forcedRotationDirection` near line 1553)
- Test: `tests/generation/turns/left-spin-rule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/generation/turns/left-spin-rule.test.ts
import { describe, expect, it } from "vitest";
import { resolveLeftSpinRule } from "../../../src/generation/turns/left-spin-rule.js";

describe("resolveLeftSpinRule", () => {
  it("is undefined with nothing to relate", () => {
    expect(resolveLeftSpinRule({})).toBeUndefined();
    expect(
      resolveLeftSpinRule({ handRelationship: { map: "reflect-north-south" } })
    ).toBeUndefined();
    expect(resolveLeftSpinRule({ matchHandTurns: true })).toBeUndefined();
  });

  it("follows the hand relationship under match turns", () => {
    const rule = resolveLeftSpinRule({
      handRelationship: { map: "reflect-north-south" },
      matchHandTurns: true,
    })!;
    expect(rule("cw")).toBe("ccw");
    expect(rule("noRotation")).toBeUndefined();
  });

  it("lets the prop relationship decide, with or without match turns", () => {
    const rule = resolveLeftSpinRule({
      propRelationship: { direction: "same" },
      handRelationship: { map: "reflect-north-south" },
    })!;
    expect(rule("cw")).toBe("cw");
    expect(
      resolveLeftSpinRule({ propRelationship: { direction: "opp" } })!("cw")
    ).toBe("ccw");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/generation/turns/left-spin-rule.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the rule module**

```ts
// src/generation/turns/left-spin-rule.ts
/**
 * Which way the left hand's dash or static spins once it gains turns, given
 * the right hand's direction. Props win: a prop relationship fixes the spin
 * relation outright, hand relationship or not. Otherwise "Match turns" plus
 * a hand relationship decides (a mirrored dash spins the other way from its
 * partner). Undefined leaves the materializer to continuity or a coin flip.
 *
 * The beam enrichment and postProcess both apply the same rule, so what the
 * constraints saw during the search is what the sequence ends up with.
 */
import {
  relatedRotationDirection,
  type HandRelationshipOptions,
} from "../constraints/style/hand-relationship-constraint.js";
import {
  propRelatedRotationDirection,
  type PropRelationshipOptions,
} from "../constraints/style/prop-relationship-constraint.js";

export type LeftSpinRule = (
  rightDirection: string | undefined
) => "cw" | "ccw" | undefined;

export function resolveLeftSpinRule(input: {
  handRelationship?: HandRelationshipOptions;
  propRelationship?: PropRelationshipOptions;
  matchHandTurns?: boolean;
}): LeftSpinRule | undefined {
  if (input.propRelationship) {
    const direction = input.propRelationship.direction;
    return (right) => propRelatedRotationDirection(right, direction);
  }
  if (input.matchHandTurns && input.handRelationship) {
    const relationship = input.handRelationship;
    return (right) => relatedRotationDirection(right, relationship);
  }
  return undefined;
}
```

- [ ] **Step 4: BeamSearch takes the rule**

In `BeamSearch.ts` replace the `relatedRotationDirection` / `HandRelationshipOptions` import with:

```ts
import type { LeftSpinRule } from "../turns/left-spin-rule.js";
```

Change `enrichWithTurns`'s last parameter from `matchedHandRelationship?: HandRelationshipOptions` to `leftSpinRule?: LeftSpinRule`, and the left enrichment's forced direction argument to:

```ts
leftSpinRule
  ? leftSpinRule(enrichedRight.rotationDirection as string | undefined)
  : undefined;
```

Update the comment above it: "Right first: a left dash or static that gains turns takes the spin the rule implies from the right hand (a prop relationship, or match turns plus a hand relationship) instead of its own continuity or coin flip."

In the options type, replace the `matchedHandRelationship` member with:

```ts
      /** Decides a left dash or static spin from the right hand's. See
       *  turns/left-spin-rule.ts and enrichWithTurns. */
      leftSpinRule?: LeftSpinRule;
```

and the three `this.options.matchedHandRelationship` reads become `this.options.leftSpinRule`.

- [ ] **Step 5: SequenceBuilder resolves and passes the rule**

Replace `resolveMatchedHandRelationship` with:

```ts
/**
 * The rule that decides a left dash or static spin, or undefined when turns
 * are independent and no prop relationship is active. Only the random
 * allocation path matches turns; a turnPattern keeps whatever lanes it was
 * given, but a prop relationship still fixes the spin.
 */
function resolveLeftSpinRuleFor(
  options: BuildOptions
): LeftSpinRule | undefined {
  return resolveLeftSpinRule({
    handRelationship: options.constraintOptions?.handRelationship,
    propRelationship: options.constraintOptions?.propRelationship,
    matchHandTurns: options.matchHandTurns === true && !options.turnPattern,
  });
}
```

Add the import `import { resolveLeftSpinRule, type LeftSpinRule } from "../turns/left-spin-rule.js";` and drop `relatedRotationDirection` from the hand-relationship import if nothing else in the file uses it (keep `type HandRelationshipOptions`, the LOOP validation still takes it).

Every `matchedHandRelationship: resolveMatchedHandRelationship(options)` becomes `leftSpinRule: resolveLeftSpinRuleFor(options)`; every `resolveMatchedHandRelationship(options)` argument to `postProcess` becomes `resolveLeftSpinRuleFor(options)`. In `postProcess`, rename the parameter `matchedHandRelationship?: HandRelationshipOptions` to `leftSpinRule?: LeftSpinRule` and the forced direction to:

```ts
        forcedRotationDirection: leftSpinRule
          ? leftSpinRule(rightTurn.rotationDirection)
          : undefined,
```

Read the `matchHandTurns` doc comment on `BuildOptions` and append one sentence: "A `constraintOptions.propRelationship` fixes that spin on its own, match turns or not."

- [ ] **Step 6: Run the rule test and the existing forced-direction tests**

Run: `npx vitest run tests/generation/turns tests/generation/hand-relationship-build.test.ts tests/generation/turn-pattern-build.test.ts`
Expected: PASS. Then `npx tsc --noEmit -p tsconfig.json` from the package directory: no errors.

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor(engine): LeftSpinRule decides dash and static spin for props and matched hands" -- packages/sequence-engine/src/generation/turns/left-spin-rule.ts packages/sequence-engine/src/generation/builder/BeamSearch.ts packages/sequence-engine/src/generation/builder/SequenceBuilder.ts packages/sequence-engine/tests/generation/turns/left-spin-rule.test.ts
```

---

### Task 5: Turn forcing, start orientation derivation, report and retry in the builder

**Files:**

- Modify: `src/generation/builder/SequenceBuilder.ts` (`resolveTurnAllocationOptions` near line 198; `build()` near line 437; `postProcess` near line 1515, the orientation block near lines 1640 to 1700)
- Modify: `src/generation/index.ts` (exports)
- Test: `tests/generation/prop-relationship-build.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/generation/prop-relationship-build.test.ts
/**
 * The prop relationship option survives the whole build: allocation forcing,
 * candidate filtering, spin forcing on dash and static, start orientation
 * derivation, and the post-build report. Production dataframes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import { SequenceBuilder } from "../../src/generation/index.js";
import type { BuildResult } from "../../src/generation/builder/SequenceBuilder.js";
import { ConstraintType } from "../../src/generation/constraints/constraint-types.js";
import {
  classifyPropRelationship,
  reportPropRelationship,
} from "../../src/generation/prop-relationship.js";
import {
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import type { MotionData } from "../../src/generation/constraints/types.js";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const diamond = () =>
  new SequenceBuilder(new CsvVariationProvider(loadDiamondVariations()));
const box = () =>
  new SequenceBuilder(new CsvVariationProvider(loadBoxVariations()));
const builderFor = (gridMode: "diamond" | "box") =>
  gridMode === "box" ? box() : diamond();

function propDetail(result: BuildResult) {
  return result.constraintReport.details.find(
    (d) => d.constraint === ConstraintType.PROP_RELATIONSHIP
  );
}

function dataset(m: MotionData): MotionData {
  const withPrefloat = m as MotionData & {
    prefloatMotionType?: string;
    prefloatRotationDirection?: string;
  };
  return {
    ...m,
    motionType: (withPrefloat.prefloatMotionType ??
      m.motionType) as MotionData["motionType"],
    rotationDirection: (withPrefloat.prefloatRotationDirection ??
      m.rotationDirection) as MotionData["rotationDirection"],
  };
}

function expectHands(result: BuildResult, options: HandRelationshipOptions) {
  for (const step of result.sequence.slice(1)) {
    expect(
      handRelationshipHolds(
        dataset(step.motions.left as unknown as MotionData),
        dataset(step.motions.right as unknown as MotionData),
        options
      ),
      `step ${step.stepNumber} (${step.letter})`
    ).toBe(true);
  }
}

beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(
        readFileSync(
          new URL(
            "../../../../static/data/learn/letter-mappings.json",
            import.meta.url
          ),
          "utf8"
        )
      ),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

describe("allocation under a prop timing", () => {
  it("gives both hands equal, non-float turns at level 3", () => {
    for (let i = 0; i < 5; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 3,
        constraintOptions: {
          propRelationship: { direction: "same", timing: "tog" },
        },
      });
      expect(result.turnAllocation.left).toEqual(result.turnAllocation.right);
      expect(result.turnAllocation.left).not.toContain("fl");
      for (const step of result.sequence.slice(1)) {
        expect(step.motions.left.turns).toBe(step.motions.right.turns);
      }
    }
  });

  it("leaves turns independent with a direction alone", () => {
    let differed = false;
    for (let i = 0; i < 10 && !differed; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 2,
        constraintOptions: { propRelationship: { direction: "opp" } },
      });
      differed = result.turnAllocation.left.some(
        (t, idx) => t !== result.turnAllocation.right[idx]
      );
    }
    expect(differed).toBe(true);
  });
});

describe("spin forcing without a hand relationship", () => {
  it("makes every turned dash or static spin opposite its partner", () => {
    for (let i = 0; i < 5; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 2,
        constraintOptions: {
          propRelationship: { direction: "opp" },
          dashPreference: "maximize",
        },
      });
      for (const step of result.sequence.slice(1)) {
        const reading = classifyPropRelationship(
          step.motions.left,
          step.motions.right
        );
        if (reading.kind === "float") continue;
        expect(
          reading.direction,
          `step ${step.stepNumber} (${step.letter})`
        ).toBe("opp");
      }
    }
  });
});

describe("start orientation under a prop timing", () => {
  it("derives the left start from the right one", () => {
    const result = diamond().build({
      length: 4,
      gridMode: "diamond",
      level: 2,
      rightStartOrientation: "in",
      constraintOptions: {
        propRelationship: { direction: "same", timing: "split" },
      },
    });
    const start = result.sequence[0]!;
    expect(start.motions.right.startOrientation).toBe("in");
    expect(
      classifyPropRelationship(
        { ...start.motions.left, rotationDirection: "cw", motionType: "pro" },
        { ...start.motions.right, rotationDirection: "cw", motionType: "pro" }
      )
    ).toEqual({ kind: "full", direction: "same", timing: "split" });
    expect(propDetail(result)?.score).toBe(1);
  });

  it("keeps a contradicting caller pair and reports it instead of throwing", () => {
    const result = diamond().build({
      length: 4,
      gridMode: "diamond",
      level: 2,
      leftStartOrientation: "in",
      rightStartOrientation: "in",
      startPlacement: "alpha1",
      constraintOptions: {
        propRelationship: { direction: "same", timing: "split" },
      },
    });
    expect(result.sequence[0]!.motions.left.startOrientation).toBe("in");
    expect(result.sequence[0]!.motions.right.startOrientation).toBe("in");
    const detail = propDetail(result);
    expect(detail).toBeDefined();
    expect(detail!.score).toBeLessThan(1);
    expect(result.constraintReport.satisfied).toBe(false);
  });
});

describe("the One-or-both table", () => {
  const TO: HandRelationshipOptions = { map: "reflect-north-south" };
  for (const gridMode of ["diamond", "box"] as const) {
    for (const level of [2, 3] as const) {
      it(`${gridMode} L${level} hands only: relationship holds, no prop report`, () => {
        const result = builderFor(gridMode).build({
          length: 6,
          gridMode,
          level,
          constraintOptions: { handRelationship: TO },
        });
        expectHands(result, TO);
        expect(propDetail(result)).toBeUndefined();
      });

      it(`${gridMode} L${level} props only: Split Same holds on every spinning beat`, () => {
        for (let i = 0; i < 3; i++) {
          const result = builderFor(gridMode).build({
            length: 6,
            gridMode,
            level,
            constraintOptions: {
              propRelationship: { direction: "same", timing: "split" },
            },
          });
          const report = reportPropRelationship(result.sequence, {
            direction: "same",
            timing: "split",
          });
          expect(report.offending, JSON.stringify(report)).toBe(0);
          expect(propDetail(result)?.score).toBe(1);
        }
      });

      it(`${gridMode} L${level} both: hands TO and props Split Same`, () => {
        for (let i = 0; i < 3; i++) {
          // Reflection flips the spin; Same props want it flipped back.
          const hands = { map: TO.map, inverted: true } as const;
          const result = builderFor(gridMode).build({
            length: 6,
            gridMode,
            level,
            constraintOptions: {
              handRelationship: hands,
              propRelationship: { direction: "same", timing: "split" },
            },
          });
          expectHands(result, hands);
          expect(
            reportPropRelationship(result.sequence, {
              direction: "same",
              timing: "split",
            }).offending
          ).toBe(0);
        }
      });
    }
  }

  it("diamond L2 both: hands TO natural and props Together Opposite", () => {
    for (let i = 0; i < 3; i++) {
      const result = diamond().build({
        length: 6,
        gridMode: "diamond",
        level: 2,
        constraintOptions: {
          handRelationship: TO,
          propRelationship: { direction: "opp", timing: "tog" },
        },
      });
      expectHands(result, TO);
      expect(
        reportPropRelationship(result.sequence, {
          direction: "opp",
          timing: "tog",
        }).offending
      ).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/generation/prop-relationship-build.test.ts`
Expected: FAIL. `propDetail` is undefined everywhere (no report yet), the equal-turns assertions fail at level 3 (floats and independent lanes), and the derivation test's classifier reading is not split.

- [ ] **Step 3: Force the allocation**

In `resolveTurnAllocationOptions`:

```ts
// A prop timing needs the phase kept beat to beat: equal turns on both
// hands and no floats (a float drops the prop out of its spin).
const propTiming = options.constraintOptions?.propRelationship?.timing;

return {
  forcePeriod4OrientationCycle: shouldForcePeriod4OrientationCycle(
    options.loop
  ),
  ...(typeof constraints.turns === "number"
    ? { requiredTurns: constraints.turns }
    : {}),
  allowFloat:
    propTiming === undefined &&
    constraints.motionType !== "pro" &&
    constraints.motionType !== "anti",
  matchHands: options.matchHandTurns === true || propTiming !== undefined,
};
```

- [ ] **Step 4: Derive the missing start orientation in `postProcess`**

Add the parameter `propRelationship?: PropRelationshipOptions` after `leftSpinRule` in `postProcess`'s signature and pass `options.constraintOptions?.propRelationship` at both call sites. Import `type PropRelationshipOptions` from `../constraints/style/prop-relationship-constraint.js` and `derivePartnerOrientation`, `reportPropRelationship` from `../prop-relationship.js`.

Just before `const propagator = new OrientationPropagator(...)`, insert:

```ts
// With a prop timing the start orientations carry the phase and equal
// turns keep it, so a missing side is derived from the given one. A pair
// the caller pinned is theirs; the post-build report says whether it held.
const startOrientations = propRelationship?.timing
  ? resolveTimedStartOrientations(shaped[0], orientationOverrides, {
      direction: propRelationship.direction,
      timing: propRelationship.timing,
    })
  : orientationOverrides;
```

and replace the three later reads of `orientationOverrides` in that method (the `leftStartOrientation` and `rightStartOrientation` resolutions and the `if (orientationOverrides && propagated[0])` block) with `startOrientations`.

Add the module-level helper (next to `resolveTurnAllocationOptions`):

```ts
/**
 * Start orientations for a timed prop relationship. The right hand's is the
 * caller's or the dataset's; the left is derived to sit at the requested
 * phase unless the caller pinned both. With only the left pinned the roles
 * swap: Together and Split are their own mirror and Quarter is a quarter
 * either way, so the same derivation serves.
 */
function resolveTimedStartOrientations(
  start: SequenceStep | undefined,
  overrides:
    | { leftStartOrientation?: string; rightStartOrientation?: string }
    | undefined,
  request: { direction: PropDirection; timing: PropTiming }
):
  | { leftStartOrientation?: string; rightStartOrientation?: string }
  | undefined {
  if (!start) return overrides;
  const left = overrides?.leftStartOrientation;
  const right = overrides?.rightStartOrientation;
  if (left && right) return overrides;
  if (!left) {
    const rightOrientation =
      right || start.motions.right.endOrientation || "in";
    const derived = derivePartnerOrientation(
      {
        orientation: rightOrientation,
        location: start.motions.right.endLocation,
      },
      start.motions.left.endLocation,
      request.direction,
      request.timing
    );
    return {
      leftStartOrientation: derived,
      rightStartOrientation: rightOrientation,
    };
  }
  const derived = derivePartnerOrientation(
    { orientation: left, location: start.motions.left.endLocation },
    start.motions.right.endLocation,
    request.direction,
    request.timing
  );
  return { leftStartOrientation: left, rightStartOrientation: derived };
}
```

Import `type PropDirection, type PropTiming` from `../prop-relationship.js`.

- [ ] **Step 5: Report and retry at the public boundary**

Rename the existing `build(options)` method to `private buildOnce(options: BuildOptions): BuildResult` (keep its body and doc comment) and add the new public entry above it:

```ts
  /**
   * Build a sequence through the 7-stage pipeline.
   *
   * With a prop relationship the result also carries a post-build report:
   * the candidate-time constraint settles shift spins and the spin rule the
   * rest, so a miss here is a phase drift the search could not see. One more
   * roll usually lands; past that, the better of the two comes back with its
   * report so the caller can say the props fell short.
   * @throws Error if neither word nor length is provided
   * @throws Error if beam search finds no valid path at all
   */
  build(options: BuildOptions): BuildResult {
    const propRelationship = options.constraintOptions?.propRelationship;
    if (!propRelationship) return this.buildOnce(options);

    const first = withPropRelationshipReport(
      this.buildOnce(options),
      propRelationship
    );
    if (propRelationshipScore(first) === 1) return first;
    let second: BuildResult;
    try {
      second = withPropRelationshipReport(
        this.buildOnce(options),
        propRelationship
      );
    } catch {
      return first;
    }
    return propRelationshipScore(second) > propRelationshipScore(first)
      ? second
      : first;
  }
```

Module-level helpers (next to `resolveTimedStartOrientations`):

```ts
function propRelationshipScore(result: BuildResult): number {
  return (
    result.constraintReport.details.find(
      (d) => d.constraint === ConstraintType.PROP_RELATIONSHIP
    )?.score ?? 1
  );
}

/**
 * Replace the search's per-candidate PROP_RELATIONSHIP entry with the reading
 * of the finished sequence, LOOP extension included. Float beats are exempt.
 */
function withPropRelationshipReport(
  result: BuildResult,
  request: PropRelationshipOptions
): BuildResult {
  const report = reportPropRelationship(result.sequence, request);
  const judged = report.holding + report.offending;
  const score = judged === 0 ? 1 : report.holding / judged;
  const detail: ConstraintDetail = {
    constraint: ConstraintType.PROP_RELATIONSHIP,
    score,
    mode: "hard",
    description:
      `Props ${request.direction}${request.timing ? ` ${request.timing}` : ""}: ` +
      `${report.holding} of ${judged} beats hold` +
      (report.exempt > 0 ? `, ${report.exempt} float beats exempt` : "") +
      (report.firstOffendingIndex !== null
        ? `, first miss at step ${report.firstOffendingIndex}`
        : ""),
  };
  const details = [
    ...result.constraintReport.details.filter(
      (d) => d.constraint !== ConstraintType.PROP_RELATIONSHIP
    ),
    detail,
  ];
  return {
    ...result,
    constraintReport: {
      ...result.constraintReport,
      details,
      satisfied: result.constraintReport.satisfied && score === 1,
    },
  };
}
```

`ConstraintDetail` comes from `../constraints/types.js` (add it to that import). `ConstraintType` is already imported.

- [ ] **Step 6: Exports**

In `src/generation/index.ts`, after the hand-relationship export block:

```ts
export {
  PropRelationshipConstraint,
  propRelationshipCouldHold,
  propRelatedRotationDirection,
  type PropRelationshipOptions,
} from "./constraints/style/prop-relationship-constraint.js";
export {
  classifyPropRelationship,
  derivePartnerOrientation,
  propBearing,
  propPhase,
  timingFromPhase,
  reportPropRelationship,
  normalizeAngle,
  LOCATION_BEARINGS,
  RADIAL_ORIENTATION_CYCLE,
  PROP_TIMING_PHASE,
  type PropDirection,
  type PropTiming,
  type PropRelationshipMotion,
  type PropRelationshipReading,
  type PropRelationshipReport,
} from "./prop-relationship.js";
export {
  resolveLeftSpinRule,
  type LeftSpinRule,
} from "./turns/left-spin-rule.js";
```

- [ ] **Step 7: Run the build tests**

Run: `npx vitest run tests/generation/prop-relationship-build.test.ts`
Expected: PASS. If a "props only" or "both" case reports offending beats, print the sequence (letters, motion types, turns, orientations per hand) for the first offending step and compare against the phase law before changing anything: the expected causes are a mixed-class letter that slipped past `propRelationshipCouldHold` (check `motionType` casing), a bridge step inserted with turns the source did not equalize (check `turnSource.at` for bridge indices), or a layer-shaping rewrite. Report the finding with the step dump if it is not one of those; do not loosen the assertion.

Run the whole package once: `npx vitest run`. Expected: all green (the existing hand-relationship, LOOP and turn tests included). Then `npx tsc --noEmit -p tsconfig.json`: no errors.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(engine): prop relationship forcing, start orientation derivation, post-build report" -- packages/sequence-engine/src/generation/builder/SequenceBuilder.ts packages/sequence-engine/src/generation/index.ts packages/sequence-engine/tests/generation/prop-relationship-build.test.ts
```

---

### Task 6: Quarter maps through a build

**Files:**

- Test: `tests/generation/quarter-hand-relationship-build.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/generation/quarter-hand-relationship-build.test.ts
/**
 * The four Quarter maps prune candidates the same way the original four do.
 * A quarter turn or a diagonal reflection is compatible with fewer letters,
 * so lengths stay short and the builder gets several rolls.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import { SequenceBuilder } from "../../src/generation/index.js";
import {
  handRelationshipHolds,
  type HandRelationshipMap,
} from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import type { MotionData } from "../../src/generation/constraints/types.js";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const QUARTER_MAPS: HandRelationshipMap[] = [
  "rotate-90-cw",
  "rotate-90-ccw",
  "reflect-northeast-southwest",
  "reflect-northwest-southeast",
];

function dataset(m: MotionData): MotionData {
  const withPrefloat = m as MotionData & {
    prefloatMotionType?: string;
    prefloatRotationDirection?: string;
  };
  return {
    ...m,
    motionType: (withPrefloat.prefloatMotionType ??
      m.motionType) as MotionData["motionType"],
    rotationDirection: (withPrefloat.prefloatRotationDirection ??
      m.rotationDirection) as MotionData["rotationDirection"],
  };
}

beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(
        readFileSync(
          new URL(
            "../../../../static/data/learn/letter-mappings.json",
            import.meta.url
          ),
          "utf8"
        )
      ),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

describe("SequenceBuilder with a Quarter hand relationship", () => {
  for (const gridMode of ["diamond", "box"] as const) {
    const provider = new CsvVariationProvider(
      gridMode === "box" ? loadBoxVariations() : loadDiamondVariations()
    );
    for (const map of QUARTER_MAPS) {
      for (const inverted of [false, true]) {
        it(`${gridMode} ${map} inverted=${inverted}: every step relates`, () => {
          const options = { map, inverted };
          const result = new SequenceBuilder(provider).build({
            length: 6,
            gridMode,
            level: 2,
            constraintOptions: { handRelationship: options },
          });
          expect(result.sequence.length).toBe(7);
          for (const step of result.sequence.slice(1)) {
            expect(
              handRelationshipHolds(
                dataset(step.motions.left as unknown as MotionData),
                dataset(step.motions.right as unknown as MotionData),
                options
              ),
              `step ${step.stepNumber} (${step.letter})`
            ).toBe(true);
          }
        });
      }
    }
  }
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/generation/quarter-hand-relationship-build.test.ts`
Expected: PASS. If a configuration throws "No valid sequence" consistently, that configuration has no compatible letters at length 6 in that grid; try `length: 4` for it and record which (grid, map, inverted) combinations need the shorter length in your report. Do not skip a configuration silently.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(engine): quarter hand relationships through a build" -- packages/sequence-engine/tests/generation/quarter-hand-relationship-build.test.ts
```

---

### Task 7: Harness rerun

**Files:**

- Create (scratchpad, not committed): `<scratchpad>/tnd-harness-2.ts`

- [ ] **Step 1: Write the harness**

Save as `C:/Users/Austen/AppData/Local/Temp/claude/E--cirque-aflame/20d11a8d-6410-4ad3-bda6-1f561a2d7647/scratchpad/tnd-harness-2.ts`. It imports the branch's engine source directly (tsx compiles it), uses the production dataframes through the test helper, and checks every beat against the hand map and the engine classifier.

```ts
/**
 * TnD harness, round 2: every hand mode (six, Quarter included), every prop
 * mode (six plus free), both grids, levels 1 to 3. Reports hand violations
 * and prop offending beats per configuration and lists the configurations
 * that fail to build. Run from the engine package directory:
 *
 *   cd E:/worktrees/tka-platform/tnd-engine/packages/sequence-engine
 *   LEVEL=2 LENGTH=8 ../../node_modules/.bin/tsx "<scratchpad>/tnd-harness-2.ts"
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const src = (p: string) => pathToFileURL(`${ROOT}/src/${p}`).href;
const test = (p: string) => pathToFileURL(`${ROOT}/tests/${p}`).href;

const { TransitionGraph } = await import(
  src("core/transition-graph/TransitionGraph.ts")
);
const { setLetterTransitionGraph } = await import(
  src("core/transition-graph/LetterTransitionGraph.ts")
);
const {
  SequenceBuilder,
  handRelationshipHolds,
  reportPropRelationship,
  isReflectionMap,
} = await import(src("generation/index.ts"));
const { CsvVariationProvider, loadBoxVariations, loadDiamondVariations } =
  await import(test("helpers/csv-variations.ts"));

const graph = new TransitionGraph({
  loadLetterMappings: async () =>
    JSON.parse(
      readFileSync(
        `${ROOT}/../../static/data/learn/letter-mappings.json`,
        "utf8"
      )
    ),
} as never);
await graph.initialize();
setLetterTransitionGraph(graph);

const HAND_MODES: Record<string, string | null> = {
  free: null,
  TS: "identity",
  TO: "reflect-north-south",
  SS: "rotate-180",
  SO: "reflect-east-west",
  QS: "rotate-90-cw",
  QO: "reflect-northeast-southwest",
};
const PROP_MODES: Record<
  string,
  { direction: "same" | "opp"; timing: "tog" | "split" | "quarter" } | null
> = {
  free: null,
  TS: { direction: "same", timing: "tog" },
  TO: { direction: "opp", timing: "tog" },
  SS: { direction: "same", timing: "split" },
  SO: { direction: "opp", timing: "split" },
  QS: { direction: "same", timing: "quarter" },
  QO: { direction: "opp", timing: "quarter" },
};

const level = Number(process.env.LEVEL ?? 2);
const length = Number(process.env.LENGTH ?? 8);
const rounds = Number(process.env.ROUNDS ?? 3);
const grids = (process.env.GRIDS ?? "diamond,box").split(",");

function dataset(m: any) {
  return {
    ...m,
    motionType: m.prefloatMotionType ?? m.motionType,
    rotationDirection: m.prefloatRotationDirection ?? m.rotationDirection,
  };
}

const failures: string[] = [];
let totalHandViolations = 0;
let totalPropOffending = 0;

for (const gridMode of grids) {
  const provider = new CsvVariationProvider(
    gridMode === "box" ? loadBoxVariations() : loadDiamondVariations()
  );
  for (const [handMode, map] of Object.entries(HAND_MODES)) {
    for (const [propMode, props] of Object.entries(PROP_MODES)) {
      const inverted =
        map && props
          ? isReflectionMap(map as any) !== (props.direction === "opp")
          : false;
      const cfg = `${gridMode} L${level} hands=${handMode} props=${propMode}`;
      let built = 0;
      let handViolations = 0;
      let propOffending = 0;
      let propExempt = 0;
      let beats = 0;
      for (let r = 0; r < rounds; r++) {
        let result: any;
        try {
          result = new SequenceBuilder(provider).build({
            length,
            gridMode,
            level,
            constraintOptions: {
              ...(map ? { handRelationship: { map, inverted } } : {}),
              ...(props ? { propRelationship: props } : {}),
            },
          });
        } catch (e: any) {
          failures.push(`${cfg}: ${e?.message ?? e}`);
          continue;
        }
        built++;
        const steps = result.sequence.slice(1);
        beats += steps.length;
        if (map) {
          for (const s of steps) {
            if (
              !handRelationshipHolds(
                dataset(s.motions.left),
                dataset(s.motions.right),
                { map, inverted }
              )
            ) {
              handViolations++;
            }
          }
        }
        if (props) {
          const report = reportPropRelationship(result.sequence, props);
          propOffending += report.offending;
          propExempt += report.exempt;
        }
      }
      totalHandViolations += handViolations;
      totalPropOffending += propOffending;
      console.log(
        `${cfg.padEnd(44)} built ${built}/${rounds}  beats ${String(beats).padStart(3)}  hand miss ${handViolations}  prop miss ${propOffending}  exempt ${propExempt}`
      );
    }
  }
}

console.log(
  `\nTOTAL hand violations: ${totalHandViolations}  prop offending: ${totalPropOffending}`
);
console.log(`\nFAILED TO BUILD (${failures.length}):`);
for (const f of failures) console.log("  " + f);
```

- [ ] **Step 2: Run it at each level and save the output**

From `E:/worktrees/tka-platform/tnd-engine/packages/sequence-engine`:

```bash
S="C:/Users/Austen/AppData/Local/Temp/claude/E--cirque-aflame/20d11a8d-6410-4ad3-bda6-1f561a2d7647/scratchpad"; for L in 1 2 3; do LEVEL=$L LENGTH=8 ../../node_modules/.bin/tsx "$S/tnd-harness-2.ts" > "$S/run2-L$L.txt" 2>&1; tail -n 3 "$S/run2-L$L.txt"; done
```

Expected: `TOTAL hand violations: 0  prop offending: 0` at every level. The failed-to-build list is reported, not fixed: paste it into the task report verbatim. Level 1 has no turns, so every prop mode's phase comes from start orientations alone and dash beats are exempt there; that is expected.

If prop offending is above zero, grep the run file for the configuration, rerun that configuration with `ROUNDS=1` and a `console.log` of the first offending step's two motions, and report the dump. Do not edit the engine to make the number move without understanding the beat.

---

### Task 8: Gate and finish

- [ ] **Step 1: Full engine tests and type check once**

From the package directory: `npx vitest run` and `npx tsc --noEmit -p tsconfig.json`. From the worktree root: `npm run build:packages` (this writes `packages/*/dist` in the worktree, which is gitignored; it proves the build graph including `tka-types` references compiles). Expected: all green.

- [ ] **Step 2: Bring the branch current**

From the worktree root: `git merge main`. No rebase. If a conflict touches a file this plan did not list, stop and report.

- [ ] **Step 3: Finish**

From `E:/tka-platform`, after the branch has been quiet for 30 minutes:

```
npm run wt:finish -- codex/tnd-engine --nonvisual
```

Then, still in `E:/tka-platform`: `npm run build:packages` so the app's `node_modules/@tka/sequence-engine/dist` carries the new exports before the companion app plan starts. If a gate fails, leave the worktree and branch intact and report the exact output.
