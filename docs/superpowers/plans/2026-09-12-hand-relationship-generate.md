# Hand Relationship in Generate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Generate constrain how the left hand relates to the right hand inside every step (Mirrored, Flipped, Unison, Opposite, each optionally Inverted) so it can produce bilaterally symmetric mandalas on demand.

**Architecture:** One new hard `IVariationConstraint` in the sequence engine compares `leftMotion` to `rightMotion` through a location map, so every relationship is the same code with a different map and the grid-mode dependency falls out of the data. The app threads a `handRelationship` + `handRelationshipInverted` pair from `UIGenerationConfig` through `GenerationOptions` to `ConstraintOptions`, coerces non-commuting LOOP settings in `resolveLoopConfig`, and adds a fourth Customize drill row.

**Tech Stack:** TypeScript, Svelte 5 runes, Vitest (engine tests in `packages/sequence-engine/tests`, app tests under `src/**`), pnpm workspace.

Spec: `docs/superpowers/specs/2026-09-12-mirrored-hands-generate-design.md`

## Global Constraints

- Worktree `C:/tka-platform-mirrored-hands`, branch `codex/hand-relationship-generate`. It has its own `node_modules` (installed with `pnpm install --offline --ignore-scripts --frozen-lockfile`) so `@tka/*` resolve to the worktree's packages, not the primary checkout's. Never touch `C:/tka-platform` (primary) or port 5173.
- Commit with explicit pathspecs only: `git commit -m "..." -- <paths>`. Never `git add -A`, never a bare `git commit`.
- No em dashes (U+2014) anywhere, including comments and copy. No word "hybrid" in any user-facing string.
- Row label is **Hand Relationship**. Never shorten it to "Hands" (that label belongs to the hand-path continuity axis inside Style). Summary fact prefix is `Relationship:`.
- Option labels: Free, Mirrored, Flipped, Unison, Opposite. Toggle: Inverted. Copy exactly as in Task 4.
- Turns, floats, orientations and dash/static spin directions stay independent per hand. The constraint only reads locations and motion types.
- LOOP combinations that cannot commute with a reflection relationship are coerced (quartered to halved, diagonal axis to the relationship's own axis), never blocked.
- Engine tests run from `packages/sequence-engine` with `npx vitest run <file>`. App tests run from the worktree root with `npx vitest run --config tests/config/vitest.config.ts <file>`. Type check with `npm run check:fast` once at the end, not per task.

---

### Task 1: Engine constraint and location maps

**Files:**

- Modify: `packages/sequence-engine/src/loop/detection/pair-relation.ts` (append two export aliases at the end of the file)
- Modify: `packages/sequence-engine/src/generation/constraints/constraint-types.ts`
- Create: `packages/sequence-engine/src/generation/constraints/style/hand-relationship-constraint.ts`
- Create: `packages/sequence-engine/tests/helpers/csv-variations.ts`
- Create: `packages/sequence-engine/tests/generation/constraints/style/hand-relationship-constraint.test.ts`

**Interfaces:**

- Produces: `HandRelationshipMap = "identity" | "rotate-180" | "reflect-north-south" | "reflect-east-west"`, `HandRelationshipOptions = { map: HandRelationshipMap; inverted?: boolean }`, `handRelationshipHolds(left: MotionData, right: MotionData, options: HandRelationshipOptions): boolean`, `class HandRelationshipConstraint implements IVariationConstraint` (hard, `type === ConstraintType.HAND_RELATIONSHIP`), `HAND_RELATIONSHIP_LOCATION_MAPS`.
- Produces (test helper): `loadDiamondVariations(): PictographData[]`, `loadBoxVariations(): PictographData[]`, `class CsvVariationProvider implements IVariationProvider`.

- [ ] **Step 1: Write the failing tests**

Create `packages/sequence-engine/tests/helpers/csv-variations.ts`:

```ts
/**
 * Real-dataset variation provider for engine tests. Copies the CSV pattern
 * from tests/generation/loop-spec-build.test.ts so builder-level tests run
 * against the production dataframes instead of a hand-built graph.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PictographData } from "../../src/generation/constraints/types.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../../static/data/pictographs");

export function loadVariations(fileName: string): PictographData[] {
  const lines = readFileSync(path.join(DATA_DIR, fileName), "utf8").split("\n");
  const out: PictographData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i]!.split(",").map((s) => s.trim());
    if (c.length < 13 || !c[0]) continue;
    out.push({
      letter: c[0],
      startPosition: c[1]!,
      endPosition: c[2]!,
      timing: c[3]!,
      direction: c[4]!,
      leftMotion: {
        hand: "left",
        motionType: c[5]!,
        rotationDirection: c[6]!,
        startLocation: c[7]!,
        endLocation: c[8]!,
        startOrientation: "in",
        endOrientation: "in",
      },
      rightMotion: {
        hand: "right",
        motionType: c[9]!,
        rotationDirection: c[10]!,
        startLocation: c[11]!,
        endLocation: c[12]!,
        startOrientation: "in",
        endOrientation: "in",
      },
    } as unknown as PictographData);
  }
  return out;
}

export const loadDiamondVariations = (): PictographData[] =>
  loadVariations("DiamondPictographDataframe.csv");
export const loadBoxVariations = (): PictographData[] =>
  loadVariations("BoxPictographDataframe.csv");

export class CsvVariationProvider implements IVariationProvider {
  private readonly index = new Map<string, PictographData[]>();

  constructor(private readonly data: PictographData[]) {
    for (const p of data) {
      const key = `${p.letter}:${p.startPosition}`;
      const bucket = this.index.get(key);
      if (bucket) bucket.push(p);
      else this.index.set(key, [p]);
    }
  }

  getVariations(
    letter: string,
    position: string,
    _gridMode: string
  ): PictographData[] {
    return this.index.get(`${letter}:${position}`) ?? [];
  }

  getAllVariations(_gridMode: string): PictographData[] {
    return this.data;
  }
}
```

Create `packages/sequence-engine/tests/generation/constraints/style/hand-relationship-constraint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  HandRelationshipConstraint,
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "../../../../src/generation/constraints/style/hand-relationship-constraint.js";
import { ConstraintType } from "../../../../src/generation/constraints/constraint-types.js";
import type {
  ConstraintContext,
  MotionData,
  PictographData,
} from "../../../../src/generation/constraints/types.js";
import {
  loadBoxVariations,
  loadDiamondVariations,
} from "../../../helpers/csv-variations.js";

function motion(
  motionType: string,
  rotationDirection: string,
  start: string,
  end: string
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
    startPosition: "?",
    endPosition: "?",
    timing: "split",
    direction: "opp",
    leftMotion: left,
    rightMotion: right,
  };
}

function context(c: PictographData): ConstraintContext {
  return {
    stepIndex: 0,
    totalSteps: 4,
    previousSteps: [],
    letter: c.letter,
    candidate: c,
  };
}

describe("handRelationshipHolds", () => {
  // Right hand E to N is a counter-clockwise arc; pro follows the hand, so ccw.
  const right = motion("pro", "ccw", "e", "n");

  it("mirrored: left is the north-south reflection with the same motion type", () => {
    expect(
      handRelationshipHolds(motion("pro", "cw", "w", "n"), right, {
        map: "reflect-north-south",
      })
    ).toBe(true);
  });

  it("mirrored rejects an identical left path (that is unison, not a mirror)", () => {
    expect(
      handRelationshipHolds(motion("pro", "ccw", "e", "n"), right, {
        map: "reflect-north-south",
      })
    ).toBe(false);
  });

  it("mirrored rejects the other motion type unless inverted", () => {
    const left = motion("anti", "ccw", "w", "n");
    expect(
      handRelationshipHolds(left, right, { map: "reflect-north-south" })
    ).toBe(false);
    expect(
      handRelationshipHolds(left, right, {
        map: "reflect-north-south",
        inverted: true,
      })
    ).toBe(true);
  });

  it("flipped: left is the east-west reflection", () => {
    expect(
      handRelationshipHolds(motion("pro", "cw", "e", "s"), right, {
        map: "reflect-east-west",
      })
    ).toBe(true);
  });

  it("unison: the same motion on both hands", () => {
    expect(
      handRelationshipHolds(motion("pro", "ccw", "e", "n"), right, {
        map: "identity",
      })
    ).toBe(true);
  });

  it("opposite: rotated 180 with the same spin", () => {
    expect(
      handRelationshipHolds(motion("pro", "ccw", "w", "s"), right, {
        map: "rotate-180",
      })
    ).toBe(true);
  });

  it("rejects a mirror whose spin contradicts the reflection", () => {
    // A reflected pro path must spin the other way. Same spin means the data
    // row is not a true mirror, whatever its locations say.
    expect(
      handRelationshipHolds(motion("pro", "ccw", "w", "n"), right, {
        map: "reflect-north-south",
      })
    ).toBe(false);
  });

  it("dash against dash qualifies; dash against a shift does not", () => {
    const rightDash = motion("dash", "noRotation", "e", "w");
    expect(
      handRelationshipHolds(motion("dash", "noRotation", "w", "e"), rightDash, {
        map: "reflect-north-south",
      })
    ).toBe(true);
    expect(
      handRelationshipHolds(motion("pro", "cw", "w", "e"), rightDash, {
        map: "reflect-north-south",
      })
    ).toBe(false);
  });

  it("inverted leaves dash and static alone: they still have to match each other", () => {
    const rightDash = motion("dash", "noRotation", "e", "w");
    expect(
      handRelationshipHolds(motion("dash", "noRotation", "w", "e"), rightDash, {
        map: "reflect-north-south",
        inverted: true,
      })
    ).toBe(true);
  });
});

describe("HandRelationshipConstraint", () => {
  it("is a hard constraint with its own type", () => {
    const constraint = new HandRelationshipConstraint({
      map: "reflect-north-south",
    });
    expect(constraint.mode).toBe("hard");
    expect(constraint.type).toBe(ConstraintType.HAND_RELATIONSHIP);
  });

  it("scores 1 and satisfied for a mirrored pair, 0 otherwise", () => {
    const constraint = new HandRelationshipConstraint({
      map: "reflect-north-south",
    });
    const good = candidate(
      motion("pro", "cw", "w", "n"),
      motion("pro", "ccw", "e", "n")
    );
    const bad = candidate(
      motion("pro", "ccw", "e", "n"),
      motion("pro", "ccw", "e", "n")
    );
    expect(constraint.evaluate(context(good))).toMatchObject({
      score: 1,
      satisfied: true,
    });
    expect(constraint.evaluate(context(bad))).toMatchObject({
      score: 0,
      satisfied: false,
    });
    expect(constraint.couldSatisfy(good)).toBe(true);
    expect(constraint.couldSatisfy(bad)).toBe(false);
  });
});

describe("against the production dataframes", () => {
  type Case = [
    string,
    () => PictographData[],
    HandRelationshipOptions,
    number,
    string[],
  ];
  const cases: Case[] = [
    [
      "diamond mirrored",
      loadDiamondVariations,
      { map: "reflect-north-south" },
      24,
      ["D", "E", "J", "K", "Φ-", "Ψ-", "α", "β"],
    ],
    [
      "diamond mirrored inverted",
      loadDiamondVariations,
      { map: "reflect-north-south", inverted: true },
      16,
      ["F", "L"],
    ],
    [
      "diamond flipped",
      loadDiamondVariations,
      { map: "reflect-east-west" },
      24,
      ["D", "E", "J", "K", "Φ-", "Ψ-", "α", "β"],
    ],
    [
      "diamond flipped inverted",
      loadDiamondVariations,
      { map: "reflect-east-west", inverted: true },
      16,
      ["F", "L"],
    ],
    [
      "diamond unison",
      loadDiamondVariations,
      { map: "identity" },
      24,
      ["G", "H", "Ψ-", "β"],
    ],
    [
      "diamond unison inverted",
      loadDiamondVariations,
      { map: "identity", inverted: true },
      16,
      ["I"],
    ],
    [
      "diamond opposite",
      loadDiamondVariations,
      { map: "rotate-180" },
      24,
      ["A", "B", "Φ-", "α"],
    ],
    [
      "diamond opposite inverted",
      loadDiamondVariations,
      { map: "rotate-180", inverted: true },
      16,
      ["C"],
    ],
    [
      "box mirrored",
      loadBoxVariations,
      { map: "reflect-north-south" },
      24,
      ["M", "N", "P", "Q", "Λ-", "γ"],
    ],
    [
      "box mirrored inverted",
      loadBoxVariations,
      { map: "reflect-north-south", inverted: true },
      16,
      ["O", "R"],
    ],
    [
      "box flipped",
      loadBoxVariations,
      { map: "reflect-east-west" },
      24,
      ["M", "N", "P", "Q", "Λ-", "γ"],
    ],
    [
      "box unison",
      loadBoxVariations,
      { map: "identity" },
      24,
      ["G", "H", "Ψ-", "β"],
    ],
    [
      "box opposite",
      loadBoxVariations,
      { map: "rotate-180" },
      24,
      ["A", "B", "Φ-", "α"],
    ],
  ];

  it.each(cases)(
    "%s selects exactly the expected rows",
    (_name, load, options, count, letters) => {
      const constraint = new HandRelationshipConstraint(options);
      const hits = load().filter((p) => constraint.couldSatisfy(p));
      expect(hits).toHaveLength(count);
      expect([...new Set(hits.map((p) => p.letter))].sort()).toEqual(
        [...letters].sort()
      );
    }
  );

  it("diamond mirrored rows start only at the north-south symmetric positions", () => {
    const constraint = new HandRelationshipConstraint({
      map: "reflect-north-south",
    });
    const starts = new Set(
      loadDiamondVariations()
        .filter((p) => constraint.couldSatisfy(p))
        .map((p) => p.startPosition)
    );
    expect([...starts].sort()).toEqual(["alpha3", "alpha7", "beta1", "beta5"]);
  });

  it("box mirrored rows start only on the reflected gamma positions", () => {
    const constraint = new HandRelationshipConstraint({
      map: "reflect-north-south",
    });
    const starts = new Set(
      loadBoxVariations()
        .filter((p) => constraint.couldSatisfy(p))
        .map((p) => p.startPosition)
    );
    expect([...starts].sort()).toEqual([
      "gamma12",
      "gamma16",
      "gamma2",
      "gamma6",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/sequence-engine`): `npx vitest run tests/generation/constraints/style/hand-relationship-constraint.test.ts`
Expected: FAIL, "Failed to resolve import .../hand-relationship-constraint.js".

- [ ] **Step 3: Export the identity and rotate-180 tables from pair-relation.ts**

Append to the end of `packages/sequence-engine/src/loop/detection/pair-relation.ts`:

```ts
// The two location tables that are not reflections, exported for the
// per-step hand relationship constraint so it does not keep its own copy.
export {
  IDENTITY as IDENTITY_LOCATION_MAP,
  ROTATE_180 as ROTATE_180_LOCATION_MAP,
};
```

- [ ] **Step 4: Add the constraint type**

In `packages/sequence-engine/src/generation/constraints/constraint-types.ts`, inside `enum ConstraintType` after `HAND_PATH = "handPath",` add:

```ts
  /** Left hand related to the right hand inside one step (mirror, unison, ...). */
  HAND_RELATIONSHIP = "handRelationship",
```

and inside `CONSTRAINT_CATEGORIES` after the `HAND_PATH` line add:

```ts
    [ConstraintType.HAND_RELATIONSHIP]: ConstraintCategory.MOTION,
```

- [ ] **Step 5: Write the constraint**

Create `packages/sequence-engine/src/generation/constraints/style/hand-relationship-constraint.ts`:

```ts
/**
 * Hand Relationship Constraint
 *
 * Ties the left hand to the right hand inside one step: the left motion's
 * locations must be the right motion's locations passed through a fixed map,
 * and the motion types must match (or be pro/anti swapped when inverted).
 *
 * This is a per-step, spatial relationship. The LOOP transforms in `loop/`
 * relate one step to a later one; this relates the two hands of the same
 * step. The two compose.
 *
 * Turns, floats, orientations and the direction a dash or static spins once
 * turns are added are all left alone. PictographData is evaluated before
 * turn allocation, so the predicate only ever sees the dataset's
 * pro/anti/dash/static and locations.
 *
 * Written against location maps, not letters, so the grid-mode dependency
 * (D/E/J/K mirror in diamond, M/N/P/Q mirror in box) comes out of the data.
 */

import { ConstraintType, type ConstraintMode } from "../constraint-types.js";
import type {
  IVariationConstraint,
  ConstraintContext,
  ConstraintScore,
  PictographData,
  MotionData,
} from "../types.js";
import { REFLECTION_LOCATION_MAPS } from "../../../loop/position-maps/strict-loop-position-maps.js";
import {
  IDENTITY_LOCATION_MAP,
  ROTATE_180_LOCATION_MAP,
} from "../../../loop/detection/pair-relation.js";

export type HandRelationshipMap =
  | "identity"
  | "rotate-180"
  | "reflect-north-south"
  | "reflect-east-west";

export interface HandRelationshipOptions {
  /** How the right hand's locations map onto the left hand's. */
  map: HandRelationshipMap;
  /** Pro on one hand is anti on the other. Dash and static are unaffected. */
  inverted?: boolean;
}

export const HAND_RELATIONSHIP_LOCATION_MAPS: Readonly<
  Record<HandRelationshipMap, Readonly<Record<string, string>>>
> = {
  identity: IDENTITY_LOCATION_MAP,
  "rotate-180": ROTATE_180_LOCATION_MAP,
  "reflect-north-south": REFLECTION_LOCATION_MAPS["north-south"],
  "reflect-east-west": REFLECTION_LOCATION_MAPS["east-west"],
};

const REFLECTIONS: ReadonlySet<HandRelationshipMap> = new Set([
  "reflect-north-south",
  "reflect-east-west",
]);

const PRO_ANTI = new Set(["pro", "anti"]);

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function motionTypesRelate(
  left: string,
  right: string,
  inverted: boolean
): boolean {
  if (!inverted) return left === right;
  // Inverted swaps pro and anti. Dash and static carry nothing to swap, so
  // they still have to match each other.
  if (PRO_ANTI.has(left) && PRO_ANTI.has(right)) return left !== right;
  return left === right;
}

/**
 * A reflection flips the hand path, so a reflected pro spins the other way;
 * inversion flips it back. Identity and rotation keep the hand path, so the
 * spin matches unless inverted. Only shifts carry a spin at this stage; a
 * dash or static gets its direction from turns later and is not checked.
 */
function spinRelates(
  left: MotionData,
  right: MotionData,
  reflection: boolean,
  inverted: boolean
): boolean {
  const lt = lower(left.motionType);
  const rt = lower(right.motionType);
  if (!PRO_ANTI.has(lt) || !PRO_ANTI.has(rt)) return true;
  const expectOpposite = reflection !== inverted;
  const same = lower(left.rotationDirection) === lower(right.rotationDirection);
  return expectOpposite ? !same : same;
}

/** True when `left` is `right` under the relationship. */
export function handRelationshipHolds(
  left: MotionData,
  right: MotionData,
  options: HandRelationshipOptions
): boolean {
  const map = HAND_RELATIONSHIP_LOCATION_MAPS[options.map];
  const start = map[lower(right.startLocation)];
  const end = map[lower(right.endLocation)];
  if (!start || !end) return false;
  if (lower(left.startLocation) !== start) return false;
  if (lower(left.endLocation) !== end) return false;
  const inverted = options.inverted === true;
  if (
    !motionTypesRelate(
      lower(left.motionType),
      lower(right.motionType),
      inverted
    )
  ) {
    return false;
  }
  return spinRelates(left, right, REFLECTIONS.has(options.map), inverted);
}

export class HandRelationshipConstraint implements IVariationConstraint {
  readonly type = ConstraintType.HAND_RELATIONSHIP;
  readonly mode: ConstraintMode = "hard";
  readonly description: string;

  constructor(private readonly options: HandRelationshipOptions) {
    this.description = `Left hand is the right hand under ${options.map}${
      options.inverted ? ", inverted" : ""
    }`;
  }

  evaluate(context: ConstraintContext): ConstraintScore {
    const ok = this.couldSatisfy(context.candidate);
    return {
      score: ok ? 1 : 0,
      satisfied: ok,
      reason: ok
        ? `Hands relate by ${this.options.map}`
        : `Left hand is not the right hand under ${this.options.map}`,
    };
  }

  couldSatisfy(candidate: PictographData): boolean {
    return handRelationshipHolds(
      candidate.leftMotion,
      candidate.rightMotion,
      this.options
    );
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/generation/constraints/style/hand-relationship-constraint.test.ts`
Expected: PASS, 26 tests. If a census case fails on count, print the offending letters before touching the predicate: the counts in the table were measured on these exact CSVs on 2026-09-12.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(engine): per-step hand relationship constraint" -- packages/sequence-engine/src/loop/detection/pair-relation.ts packages/sequence-engine/src/generation/constraints/constraint-types.ts packages/sequence-engine/src/generation/constraints/style/hand-relationship-constraint.ts packages/sequence-engine/tests/helpers/csv-variations.ts packages/sequence-engine/tests/generation/constraints/style/hand-relationship-constraint.test.ts
```

---

### Task 2: Wire the constraint into ConstraintOptions, the composer, and the package exports

**Files:**

- Modify: `packages/sequence-engine/src/generation/constraints/composition/constraint-options.ts`
- Modify: `packages/sequence-engine/src/generation/constraints/composition/build-constraint-set.ts`
- Modify: `packages/sequence-engine/src/generation/index.ts`
- Test: `packages/sequence-engine/tests/generation/constraints/composition/build-constraint-set.test.ts`

**Interfaces:**

- Consumes: `HandRelationshipConstraint`, `HandRelationshipOptions` from Task 1.
- Produces: `ConstraintOptions.handRelationship?: HandRelationshipOptions`; `@tka/sequence-engine/generation` exports `HandRelationshipConstraint`, `handRelationshipHolds`, `HAND_RELATIONSHIP_LOCATION_MAPS`, and the types `HandRelationshipMap`, `HandRelationshipOptions`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("buildConstraintSet", ...)` block of `packages/sequence-engine/tests/generation/constraints/composition/build-constraint-set.test.ts`, before its closing `});`:

```ts
it("creates a hard HandRelationshipConstraint for handRelationship", () => {
  const result = buildConstraintSet({
    handRelationship: { map: "reflect-north-south", inverted: true },
  });
  const constraint = result.hard.find(
    (c) => c.type === ConstraintType.HAND_RELATIONSHIP
  );
  expect(constraint).toBeDefined();
  expect(constraint!.mode).toBe("hard");
  expect(constraint!.description).toContain("reflect-north-south");
  expect(constraint!.description).toContain("inverted");
  expect(result.soft).toHaveLength(0);
});

it("does not create a hand relationship constraint when the option is absent", () => {
  const result = buildConstraintSet({ propContinuity: "maximize" });
  expect(
    result.hard.find((c) => c.type === ConstraintType.HAND_RELATIONSHIP)
  ).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/generation/constraints/composition/build-constraint-set.test.ts`
Expected: FAIL on "creates a hard HandRelationshipConstraint" (constraint undefined).

- [ ] **Step 3: Add the option**

In `packages/sequence-engine/src/generation/constraints/composition/constraint-options.ts`, add the import at the top:

```ts
import type { HandRelationshipOptions } from "../style/hand-relationship-constraint.js";
```

and add this field at the end of `interface ConstraintOptions`, after `dashPreference`:

```ts
  /** Tie the left hand to the right hand inside every step. Hard. See
   *  HandRelationshipConstraint for the maps and what "inverted" means. */
  handRelationship?: HandRelationshipOptions;
```

- [ ] **Step 4: Push it in the composer**

In `packages/sequence-engine/src/generation/constraints/composition/build-constraint-set.ts`, add the import next to the other style imports:

```ts
import { HandRelationshipConstraint } from "../style/hand-relationship-constraint.js";
```

and, just before `const set: ConstraintSet = { hard, soft };`, add:

```ts
// Hand relationship dimension. Hard: a pair either relates or it does not.
if (options.handRelationship) {
  hard.push(new HandRelationshipConstraint(options.handRelationship));
}
```

- [ ] **Step 5: Export from the generation index**

In `packages/sequence-engine/src/generation/index.ts`, after the `per-hand-dash-constraint.js` export block, add:

```ts
export {
  HandRelationshipConstraint,
  handRelationshipHolds,
  HAND_RELATIONSHIP_LOCATION_MAPS,
  type HandRelationshipMap,
  type HandRelationshipOptions,
} from "./constraints/style/hand-relationship-constraint.js";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/generation/constraints/composition/build-constraint-set.test.ts tests/generation/constraints/style/hand-relationship-constraint.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(engine): compose handRelationship into the constraint set" -- packages/sequence-engine/src/generation/constraints/composition/constraint-options.ts packages/sequence-engine/src/generation/constraints/composition/build-constraint-set.ts packages/sequence-engine/src/generation/index.ts packages/sequence-engine/tests/generation/constraints/composition/build-constraint-set.test.ts
```

---

### Task 3: Builder-level proof on the real dataset

**Files:**

- Create: `packages/sequence-engine/tests/generation/hand-relationship-build.test.ts`

**Interfaces:**

- Consumes: `SequenceBuilder` (`build({ length, gridMode, level, constraintOptions, maxTurnIntensity, loop })` returns `BuildResult` with `sequence: Step[]`, index 0 the start position, each step carrying `motions.left` / `motions.right` with `motionType`, `rotationDirection`, `startLocation`, `endLocation`, and for floats `prefloatMotionType` / `prefloatRotationDirection`), `handRelationshipHolds`, `CsvVariationProvider`, `isSequenceCircular`.

- [ ] **Step 1: Write the tests**

Create `packages/sequence-engine/tests/generation/hand-relationship-build.test.ts`:

```ts
/**
 * The hand relationship option survives the whole build: reachability
 * pre-filter, first-step selection, beam search, turn materialization and
 * LOOP extension. Runs against the production dataframes.
 */
import { describe, expect, it } from "vitest";
import { SequenceBuilder } from "../../src/generation/index.js";
import {
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import type { MotionData } from "../../src/generation/constraints/types.js";
import type { Step } from "../../src/core/types/sequence-engine-types.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { isSequenceCircular } from "../../src/loop/detection/LOOPDetector.js";
import {
  CsvVariationProvider,
  loadBoxVariations,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const MIRRORED: HandRelationshipOptions = { map: "reflect-north-south" };

const diamond = () =>
  new SequenceBuilder(new CsvVariationProvider(loadDiamondVariations()));
const box = () =>
  new SequenceBuilder(new CsvVariationProvider(loadBoxVariations()));

/**
 * Turns are independent per hand, so one hand may have floated. The
 * relationship is a statement about the dataset motion, which a float keeps
 * in prefloatMotionType / prefloatRotationDirection.
 */
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

function expectRelationship(
  sequence: Step[],
  options: HandRelationshipOptions
): void {
  expect(sequence.length).toBeGreaterThan(1);
  for (const step of sequence.slice(1)) {
    const left = dataset(step.motions.left as unknown as MotionData);
    const right = dataset(step.motions.right as unknown as MotionData);
    expect(
      handRelationshipHolds(left, right, options),
      `step ${step.stepNumber} (${step.letter}) ${left.startLocation}>${left.endLocation} vs ${right.startLocation}>${right.endLocation}`
    ).toBe(true);
  }
}

describe("SequenceBuilder with a hand relationship", () => {
  it("diamond L1 mirrored: every step mirrors and the start is symmetric", () => {
    for (let i = 0; i < 5; i++) {
      const result = diamond().build({
        length: 8,
        gridMode: "diamond",
        level: 1,
        constraintOptions: { handRelationship: MIRRORED },
      });
      expectRelationship(result.sequence, MIRRORED);
      expect(["alpha3", "alpha7", "beta1", "beta5"]).toContain(
        String(result.sequence[0]!.startPosition)
      );
    }
  });

  it("box L1 mirrored lands on the reflected gamma positions", () => {
    const result = box().build({
      length: 8,
      gridMode: "box",
      level: 1,
      constraintOptions: { handRelationship: MIRRORED },
    });
    expectRelationship(result.sequence, MIRRORED);
    expect(["gamma2", "gamma6", "gamma12", "gamma16"]).toContain(
      String(result.sequence[0]!.startPosition)
    );
  });

  it.each([
    ["flipped", { map: "reflect-east-west" } as HandRelationshipOptions],
    ["unison", { map: "identity" } as HandRelationshipOptions],
    ["opposite", { map: "rotate-180" } as HandRelationshipOptions],
    [
      "mirrored inverted",
      { map: "reflect-north-south", inverted: true } as HandRelationshipOptions,
    ],
  ])("diamond L1 %s holds on every step", (_name, options) => {
    const result = diamond().build({
      length: 8,
      gridMode: "diamond",
      level: 1,
      constraintOptions: { handRelationship: options },
    });
    expectRelationship(result.sequence, options);
  });

  it("L3 with full turn intensity still holds: turns and floats vary per hand", () => {
    const result = diamond().build({
      length: 8,
      gridMode: "diamond",
      level: 3,
      maxTurnIntensity: 3,
      constraintOptions: { handRelationship: MIRRORED },
    });
    expectRelationship(result.sequence, MIRRORED);
  });

  it("mirrored plus rotated halved closes and stays mirrored through the loop", () => {
    const result = diamond().build({
      length: 4,
      gridMode: "diamond",
      level: 1,
      constraintOptions: { handRelationship: MIRRORED },
      loop: {
        type: LOOPType.ROTATED,
        period: Period.HALVED,
        useTargetedGeneration: true,
        requestedTotalLength: 8,
      },
    });
    expect(isSequenceCircular(result.sequence)).toBe(true);
    expectRelationship(result.sequence, MIRRORED);
  });

  it("unison plus rotated quartered closes: identity commutes with everything", () => {
    const result = diamond().build({
      length: 2,
      gridMode: "diamond",
      level: 1,
      constraintOptions: { handRelationship: { map: "identity" } },
      loop: {
        type: LOOPType.ROTATED,
        period: Period.QUARTERED,
        useTargetedGeneration: true,
        requestedTotalLength: 8,
      },
    });
    expect(isSequenceCircular(result.sequence)).toBe(true);
    expectRelationship(result.sequence, { map: "identity" });
  });

  it("mirrored plus rotated quartered cannot close and says so", () => {
    expect(() =>
      diamond().build({
        length: 2,
        gridMode: "diamond",
        level: 1,
        constraintOptions: { handRelationship: MIRRORED },
        loop: {
          type: LOOPType.ROTATED,
          period: Period.QUARTERED,
          useTargetedGeneration: true,
          requestedTotalLength: 8,
        },
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/generation/hand-relationship-build.test.ts`
Expected: PASS. If "unison plus rotated quartered" fails to close, read the error: G/H rows must reach the 90-degree-rotated beta from the start beta in two steps; if the engine's closure targeting needs a longer seed, raise `length` to 4 and `requestedTotalLength` to 16 and note it in the test comment. Do not weaken the assertion.

- [ ] **Step 3: Run the whole engine suite once**

Run: `npx vitest run`
Expected: all green (no engine behavior changes when the option is absent).

- [ ] **Step 4: Commit**

```bash
git commit -m "test(engine): hand relationship survives build, turns and loops" -- packages/sequence-engine/tests/generation/hand-relationship-build.test.ts
```

---

### Task 4: App domain vocabulary

**Files:**

- Create: `src/lib/shared/create/domain/hand-relationship.ts`
- Create: `src/lib/shared/create/domain/hand-relationship.test.ts`

**Interfaces:**

- Consumes: `HandRelationshipMap`, `HandRelationshipOptions` from `@tka/sequence-engine/generation`; `ReflectionAxis` from `@tka/sequence-engine/loop`.
- Produces: `HandRelationship = "free" | "mirrored" | "flipped" | "unison" | "opposite"`, `HAND_RELATIONSHIPS`, `DEFAULT_HAND_RELATIONSHIP`, `isHandRelationship(value: unknown)`, `relationshipReflectionAxis(r): ReflectionAxis | null`, `handRelationshipToEngine(r, inverted): HandRelationshipOptions | undefined`, `HAND_RELATIONSHIP_LABELS`, `HAND_RELATIONSHIP_HINTS`, `HAND_RELATIONSHIP_INVERTED_HINT`, `describeHandRelationship(r, inverted): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/create/domain/hand-relationship.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAND_RELATIONSHIP,
  HAND_RELATIONSHIPS,
  HAND_RELATIONSHIP_HINTS,
  HAND_RELATIONSHIP_INVERTED_HINT,
  HAND_RELATIONSHIP_LABELS,
  describeHandRelationship,
  handRelationshipToEngine,
  isHandRelationship,
  relationshipReflectionAxis,
} from "./hand-relationship";

describe("hand relationship vocabulary", () => {
  it("defaults to free and recognizes only its own values", () => {
    expect(DEFAULT_HAND_RELATIONSHIP).toBe("free");
    expect(HAND_RELATIONSHIPS).toEqual([
      "free",
      "mirrored",
      "flipped",
      "unison",
      "opposite",
    ]);
    expect(isHandRelationship("mirrored")).toBe(true);
    expect(isHandRelationship("sideways")).toBe(false);
    expect(isHandRelationship(undefined)).toBe(false);
  });

  it("maps every relationship to an engine map and free to nothing", () => {
    expect(handRelationshipToEngine("free", true)).toBeUndefined();
    expect(handRelationshipToEngine("mirrored", false)).toEqual({
      map: "reflect-north-south",
      inverted: false,
    });
    expect(handRelationshipToEngine("flipped", true)).toEqual({
      map: "reflect-east-west",
      inverted: true,
    });
    expect(handRelationshipToEngine("unison", false)).toEqual({
      map: "identity",
      inverted: false,
    });
    expect(handRelationshipToEngine("opposite", false)).toEqual({
      map: "rotate-180",
      inverted: false,
    });
  });

  it("names the axis a reflection relationship keeps", () => {
    expect(relationshipReflectionAxis("mirrored")).toBe("north-south");
    expect(relationshipReflectionAxis("flipped")).toBe("east-west");
    expect(relationshipReflectionAxis("unison")).toBeNull();
    expect(relationshipReflectionAxis("opposite")).toBeNull();
    expect(relationshipReflectionAxis("free")).toBeNull();
  });

  it("describes the row value", () => {
    expect(describeHandRelationship("free", true)).toBe("Free");
    expect(describeHandRelationship("mirrored", false)).toBe("Mirrored");
    expect(describeHandRelationship("mirrored", true)).toBe(
      "Mirrored, inverted"
    );
  });

  it("never says hybrid and never uses an em dash", () => {
    const copy = [
      ...Object.values(HAND_RELATIONSHIP_LABELS),
      ...Object.values(HAND_RELATIONSHIP_HINTS),
      HAND_RELATIONSHIP_INVERTED_HINT,
    ].join(" ");
    expect(copy.toLowerCase()).not.toContain("hybrid");
    expect(copy).not.toContain("\u2014");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (worktree root): `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/create/domain/hand-relationship.test.ts`
Expected: FAIL, cannot resolve `./hand-relationship`.

- [ ] **Step 3: Write the module**

Create `src/lib/shared/create/domain/hand-relationship.ts`:

```ts
/**
 * How the left hand relates to the right hand inside each generated step.
 *
 * This is the app's vocabulary for the engine's HandRelationshipConstraint.
 * It sits beside generation-style.ts but is not part of GenerationStylePolicy:
 * Generate is the only surface that offers it, so Fuse and the public Composer
 * demo keep their untouched recipe unchanged.
 *
 * Turns, floats, orientations and dash spin stay independent per hand. The
 * relationship is about hand paths and motion types only.
 */
import type {
  HandRelationshipMap,
  HandRelationshipOptions,
} from "@tka/sequence-engine/generation";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";

export type HandRelationship =
  | "free"
  | "mirrored"
  | "flipped"
  | "unison"
  | "opposite";

export const HAND_RELATIONSHIPS: readonly HandRelationship[] = [
  "free",
  "mirrored",
  "flipped",
  "unison",
  "opposite",
];

export const DEFAULT_HAND_RELATIONSHIP: HandRelationship = "free";

export function isHandRelationship(value: unknown): value is HandRelationship {
  return (
    typeof value === "string" &&
    (HAND_RELATIONSHIPS as readonly string[]).includes(value)
  );
}

/**
 * The LOOP reflection axis a reflection relationship keeps. Mirrored and
 * Flipped only survive LOOP transforms that commute with them: rotate 180,
 * the two cardinal reflections, swap, invert, rewind. A 90-degree rotation or
 * a diagonal axis does not, and resolveLoopConfig coerces those to this axis.
 * Null for Free, Unison and Opposite, which commute with every LOOP.
 */
export function relationshipReflectionAxis(
  relationship: HandRelationship
): ReflectionAxis | null {
  if (relationship === "mirrored") return "north-south";
  if (relationship === "flipped") return "east-west";
  return null;
}

const ENGINE_MAP: Record<
  Exclude<HandRelationship, "free">,
  HandRelationshipMap
> = {
  mirrored: "reflect-north-south",
  flipped: "reflect-east-west",
  unison: "identity",
  opposite: "rotate-180",
};

/** The engine option for a relationship, or undefined for Free. */
export function handRelationshipToEngine(
  relationship: HandRelationship,
  inverted: boolean
): HandRelationshipOptions | undefined {
  if (relationship === "free") return undefined;
  return { map: ENGINE_MAP[relationship], inverted };
}

export const HAND_RELATIONSHIP_LABELS: Record<HandRelationship, string> = {
  free: "Free",
  mirrored: "Mirrored",
  flipped: "Flipped",
  unison: "Unison",
  opposite: "Opposite",
};

export const HAND_RELATIONSHIP_HINTS: Record<HandRelationship, string> = {
  free: "Each hand is chosen on its own.",
  mirrored: "The left hand traces the mirror image of the right, side to side.",
  flipped: "The left hand traces the mirror image of the right, top to bottom.",
  unison: "Both hands move through the same point in the same direction.",
  opposite: "Hands stay across from each other and arc the same way.",
};

export const HAND_RELATIONSHIP_INVERTED_HINT =
  "The left hand uses the other motion type. Pro on the right is anti on the left.";

/** Row and summary wording: "Free", "Mirrored", "Mirrored, inverted". */
export function describeHandRelationship(
  relationship: HandRelationship,
  inverted: boolean
): string {
  const label = HAND_RELATIONSHIP_LABELS[relationship];
  return relationship !== "free" && inverted ? `${label}, inverted` : label;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/create/domain/hand-relationship.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(create): hand relationship vocabulary" -- src/lib/shared/create/domain/hand-relationship.ts src/lib/shared/create/domain/hand-relationship.test.ts
```

---

### Task 5: Options plumbing and LOOP coercion

**Files:**

- Modify: `src/lib/shared/foundation/domain/models/generation/generate-models.ts` (after `motionTypeFilter`, ~line 65)
- Modify: `src/lib/shared/create/utils/config-mapper.ts` (`UIGenerationConfig` ~line 111-114; `uiConfigToGenerationOptions` ~line 146-150 and ~line 185-188; `generationOptionsToUIConfig` ~line 231)
- Modify: `src/lib/shared/create/services/loop-type-utils.ts` (`resolveLoopConfig`, ~line 225-250)
- Modify: `src/lib/shared/create/services/generation-orchestrator.ts` (`mapConstraints`, ~line 264-310)
- Modify: `src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts` (the `const config: UIGenerationConfig = {` literal, ~line 185)
- Create: `src/lib/shared/create/services/loop-type-utils.hand-relationship.test.ts`
- Create: `tests/unit/services/generation-orchestrator-hand-relationship.test.ts`

**Interfaces:**

- Consumes: Task 4 module.
- Produces: `UIGenerationConfig.handRelationship: HandRelationship` and `UIGenerationConfig.handRelationshipInverted: boolean` (required); `GenerationOptions.handRelationship?`, `GenerationOptions.handRelationshipInverted?`; `resolveLoopConfig(loopType, period, { ..., handRelationship? })` coercion.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/shared/create/services/loop-type-utils.hand-relationship.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveLoopConfig } from "./loop-type-utils";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

describe("resolveLoopConfig with a hand relationship", () => {
  it("coerces quartered rotation to halved for Mirrored and Flipped hands", () => {
    for (const handRelationship of ["mirrored", "flipped"]) {
      const resolved = resolveLoopConfig(LOOPType.ROTATED, "quartered", {
        handRelationship,
      });
      expect(resolved.period).toBe("halved");
      expect(resolved.loopRhythm.rotationInterval).toBe(2);
    }
  });

  it("keeps quartered rotation for Free, Unison, Opposite and no relationship", () => {
    for (const handRelationship of ["free", "unison", "opposite", undefined]) {
      expect(
        resolveLoopConfig(LOOPType.ROTATED, "quartered", { handRelationship })
          .period
      ).toBe("quartered");
    }
  });

  it("moves a diagonal reflection axis onto the relationship's own axis", () => {
    expect(
      resolveLoopConfig(LOOPType.MIRRORED, "halved", {
        reflectionAxis: "northeast-southwest",
        handRelationship: "mirrored",
      }).loopRhythm.reflectionAxis
    ).toBe("north-south");
    expect(
      resolveLoopConfig(LOOPType.MIRRORED, "halved", {
        reflectionAxis: "northwest-southeast",
        handRelationship: "flipped",
      }).loopRhythm.reflectionAxis
    ).toBe("east-west");
  });

  it("leaves a cardinal axis alone: both cardinal reflections commute with both relationships", () => {
    expect(
      resolveLoopConfig(LOOPType.MIRRORED, "halved", {
        reflectionAxis: "east-west",
        handRelationship: "mirrored",
      }).loopRhythm.reflectionAxis
    ).toBe("east-west");
  });

  it("leaves a diagonal axis alone when the relationship is not a reflection", () => {
    expect(
      resolveLoopConfig(LOOPType.MIRRORED, "halved", {
        reflectionAxis: "northeast-southwest",
        handRelationship: "unison",
      }).loopRhythm.reflectionAxis
    ).toBe("northeast-southwest");
  });
});
```

Create `tests/unit/services/generation-orchestrator-hand-relationship.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Same stub pattern as generation-orchestrator-loopspec.test.ts: only the
// generation subpath is mocked so we can read what reaches build().
const buildMock = vi.fn();
vi.mock("@tka/sequence-engine/generation", () => {
  class SequenceBuilder {
    build(...args: unknown[]) {
      return buildMock(...args);
    }
  }
  return { SequenceBuilder };
});

import { GenerationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import {
  GenerationMode,
  DifficultyLevel,
  type GenerationOptions,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

function baseOptions(overrides: Partial<GenerationOptions>): GenerationOptions {
  return {
    mode: GenerationMode.FREEFORM,
    length: 8,
    gridMode: GridMode.DIAMOND,
    propType: PropType.FAN,
    difficulty: DifficultyLevel.BEGINNER,
    ...overrides,
  };
}

function makeOrchestrator() {
  const stubVariationProvider = {
    initialize: vi.fn().mockResolvedValue(undefined),
  };
  const stubTransformer = {
    convertToSequenceData: vi.fn().mockResolvedValue({ id: "stub" }),
  };
  const stubMetadataManager = {
    mapDifficultyToLevel: vi.fn().mockReturnValue(1),
  };
  buildMock.mockReturnValue({ sequence: [] });
  return new GenerationOrchestrator(
    stubVariationProvider as never,
    stubTransformer as never,
    stubMetadataManager as never
  );
}

describe("GenerationOrchestrator hand relationship", () => {
  beforeEach(() => buildMock.mockReset());

  it("passes the relationship to the engine as a constraint option", async () => {
    await makeOrchestrator().generateSequence(
      baseOptions({
        handRelationship: "mirrored",
        handRelationshipInverted: true,
      })
    );
    const callArg = buildMock.mock.calls[0]![0];
    expect(callArg.constraintOptions.handRelationship).toEqual({
      map: "reflect-north-south",
      inverted: true,
    });
  });

  it("sends nothing for Free or when the field is absent", async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.generateSequence(
      baseOptions({ handRelationship: "free" })
    );
    await orchestrator.generateSequence(baseOptions({}));
    for (const call of buildMock.mock.calls) {
      expect(call[0].constraintOptions.handRelationship).toBeUndefined();
    }
  });

  it("also reaches the circular path", async () => {
    await makeOrchestrator().generateSequence(
      baseOptions({
        mode: GenerationMode.CIRCULAR,
        loopType: "rotated" as never,
        period: "halved" as never,
        handRelationship: "unison",
        handRelationshipInverted: false,
      })
    );
    const callArg = buildMock.mock.calls[0]![0];
    expect(callArg.constraintOptions.handRelationship).toEqual({
      map: "identity",
      inverted: false,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/create/services/loop-type-utils.hand-relationship.test.ts tests/unit/services/generation-orchestrator-hand-relationship.test.ts`
Expected: FAIL. The coercion tests get "quartered"; the orchestrator tests get `undefined` for the relationship.

- [ ] **Step 3: GenerationOptions**

In `src/lib/shared/foundation/domain/models/generation/generate-models.ts`, add to the imports:

```ts
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
```

and after the line `motionTypeFilter?: "no-dash" | "prefer-dash" | null | undefined;` add:

```ts
  // Hand relationship: how the left hand relates to the right inside each
  // step. "free" or absent means unconstrained. Inverted is ignored for free.
  handRelationship?: HandRelationship | undefined;
  handRelationshipInverted?: boolean | undefined;
```

- [ ] **Step 4: UIGenerationConfig and the mapper**

In `src/lib/shared/create/utils/config-mapper.ts`:

Add to the imports:

```ts
import {
  DEFAULT_HAND_RELATIONSHIP,
  type HandRelationship,
} from "$lib/shared/create/domain/hand-relationship";
```

In `interface UIGenerationConfig`, after `motionTypeFilter: GenerationMotionTypeFilter; // Dash frequency ("mixed" = null)` add:

```ts
// Hand relationship (Generate only, not part of GenerationStylePolicy)
handRelationship: HandRelationship;
handRelationshipInverted: boolean;
```

In `uiConfigToGenerationOptions`, change the `resolveLoopConfig(...)` call so the rhythm object also carries the relationship:

```ts
      ? resolveLoopConfig(uiConfig.loopType, uiConfig.period, {
          inversionInterval: uiConfig.inversionInterval,
          inversionMode: uiConfig.inversionMode,
          reflectionAxis: uiConfig.reflectionAxis,
          handRelationship: uiConfig.handRelationship,
        })
```

and in the `options` literal, after `motionTypeFilter: uiConfig.motionTypeFilter ?? undefined,` add:

```ts
    handRelationship: uiConfig.handRelationship ?? DEFAULT_HAND_RELATIONSHIP,
    handRelationshipInverted: uiConfig.handRelationshipInverted ?? false,
```

In `generationOptionsToUIConfig`, after `motionTypeFilter: options.motionTypeFilter ?? null,` add:

```ts
    handRelationship: options.handRelationship ?? DEFAULT_HAND_RELATIONSHIP,
    handRelationshipInverted: options.handRelationshipInverted ?? false,
```

- [ ] **Step 5: resolveLoopConfig coercion**

In `src/lib/shared/create/services/loop-type-utils.ts`, add to the imports:

```ts
import {
  DEFAULT_HAND_RELATIONSHIP,
  isHandRelationship,
  relationshipReflectionAxis,
} from "$lib/shared/create/domain/hand-relationship";
```

Replace the head of `resolveLoopConfig` (signature through the `reflectionAxis:` entry of `loopRhythm`) with:

```ts
export function resolveLoopConfig(
  loopType: LOOPType | string,
  requestedPeriod: string | undefined,
  rhythmOpts?: {
    inversionInterval?: 2 | 4;
    inversionMode?: "expand" | "overlay";
    reflectionAxis?: ReflectionAxis;
    /**
     * A reflection hand relationship (Mirrored, Flipped) only survives LOOP
     * transforms that commute with it. Quartered rotation and the diagonal
     * axes do not, so they are coerced here rather than blocked: the LOOP
     * card, the length stepper and the engine all read this one resolved
     * value. Accepts the raw config field, so an unknown string reads as free.
     */
    handRelationship?: string | null;
  },
): ResolvedLoopConfig {
  const requestedRelationship = rhythmOpts?.handRelationship;
  const relationship = isHandRelationship(requestedRelationship)
    ? requestedRelationship
    : DEFAULT_HAND_RELATIONSHIP;
  const keptAxis = relationshipReflectionAxis(relationship);
  const supportsQuartered =
    ROTATED_LOOP_TYPES.has(loopType as LOOPType) && keptAxis === null;
  const period: "halved" | "quartered" =
    supportsQuartered && requestedPeriod === "quartered" ? "quartered" : "halved";
  const requestedAxis: ReflectionAxis =
    rhythmOpts?.reflectionAxis ??
    (String(loopType).includes("flipped") ? "east-west" : "north-south");
  const diagonal =
    requestedAxis === "northeast-southwest" ||
    requestedAxis === "northwest-southeast";
  const loopRhythm: LoopRhythm = {
    rotationInterval: period === "quartered" ? 4 : 2,
    inversionInterval: rhythmOpts?.inversionInterval ?? 2,
    inversionMode: rhythmOpts?.inversionMode ?? "expand",
    reflectionAxis: keptAxis && diagonal ? keptAxis : requestedAxis,
  };
```

Keep the rest of the function (`const loopSpecWire = ...; return { period, loopSpecWire, loopRhythm };`) unchanged.

- [ ] **Step 6: Orchestrator mapping**

In `src/lib/shared/create/services/generation-orchestrator.ts`, add to the imports:

```ts
import { handRelationshipToEngine } from "$lib/shared/create/domain/hand-relationship";
```

In `mapConstraints`, just before `return result;`, add:

```ts
// Hand relationship: a hard per-step constraint, passed straight through.
// Anything added to GenerationOptions has to be threaded here or it does
// nothing (see the endPositions note at the top of this file).
const relationship = handRelationshipToEngine(
  options.handRelationship ?? "free",
  options.handRelationshipInverted ?? false
);
if (relationship) {
  result.handRelationship = relationship;
}
```

- [ ] **Step 7: Fix the one typed config literal in an existing test**

In `src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts`, inside `const config: UIGenerationConfig = {` (the `card-configurator LOOP descriptor` block), after `motionTypeFilter: null,` add:

```ts
    handRelationship: "free",
    handRelationshipInverted: false,
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/create/services/loop-type-utils.hand-relationship.test.ts tests/unit/services/generation-orchestrator-hand-relationship.test.ts tests/unit/services/generation-orchestrator-loopspec.test.ts src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(create): thread hand relationship to the engine and coerce non-commuting loops" -- src/lib/shared/foundation/domain/models/generation/generate-models.ts src/lib/shared/create/utils/config-mapper.ts src/lib/shared/create/services/loop-type-utils.ts src/lib/shared/create/services/loop-type-utils.hand-relationship.test.ts src/lib/shared/create/services/generation-orchestrator.ts tests/unit/services/generation-orchestrator-hand-relationship.test.ts src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts
```

---

### Task 6: Persistence, defaults, and the normalizer

**Files:**

- Modify: `src/lib/features/create/generate/state/generate-config.svelte.ts` (`SerializedConfig` ~line 35-57, `saveConfig` ~line 62-85, `loadConfig` ~line 165-175, `DEFAULT_CONFIG` ~line 208-222)
- Modify: `src/lib/features/create/generate/domain/generator-persistence-normalizer.ts`
- Create: `src/lib/features/create/generate/state/generate-config-hand-relationship.test.ts`

**Interfaces:**

- Consumes: Task 4 and Task 5.
- Produces: `GENERATE_DEFAULT_CONFIG.handRelationship === "free"`, `GENERATE_DEFAULT_CONFIG.handRelationshipInverted === false`; both fields persisted in `tka-generate-config`; unknown persisted values dropped.

- [ ] **Step 1: Write the failing test**

Create `src/lib/features/create/generate/state/generate-config-hand-relationship.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  createGenerationConfigState,
  GENERATE_DEFAULT_CONFIG,
} from "./generate-config.svelte";
import { uiConfigToGenerationOptions } from "../shared/utils/config-mapper";
import { normalizePersistedGenerationConfig } from "../domain/generator-persistence-normalizer";

beforeEach(() => localStorage.clear());

describe("Hand relationship in the Generate config", () => {
  it("starts Free and not inverted", () => {
    expect(GENERATE_DEFAULT_CONFIG.handRelationship).toBe("free");
    expect(GENERATE_DEFAULT_CONFIG.handRelationshipInverted).toBe(false);
    const state = createGenerationConfigState();
    expect(state.config.handRelationship).toBe("free");
    expect(state.config.handRelationshipInverted).toBe(false);
  });

  it("round-trips through localStorage", () => {
    const first = createGenerationConfigState();
    first.updateConfig({
      handRelationship: "mirrored",
      handRelationshipInverted: true,
    });
    const second = createGenerationConfigState();
    expect(second.config.handRelationship).toBe("mirrored");
    expect(second.config.handRelationshipInverted).toBe(true);
  });

  it("reaches GenerationOptions", () => {
    const state = createGenerationConfigState();
    state.updateConfig({ handRelationship: "unison" });
    const options = uiConfigToGenerationOptions(state.config);
    expect(options.handRelationship).toBe("unison");
    expect(options.handRelationshipInverted).toBe(false);
  });

  it("drops an unknown persisted value so the default wins", () => {
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "sideways",
        handRelationshipInverted: "yes",
      })
    ).toEqual({});
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "flipped",
        handRelationshipInverted: true,
      })
    ).toEqual({ handRelationship: "flipped", handRelationshipInverted: true });
  });

  it("coerces the default quartered rotation to halved once the hands are mirrored", () => {
    const state = createGenerationConfigState();
    state.updateConfig({
      loopEnabled: true,
      loopType: "rotated",
      period: "quartered",
      handRelationship: "mirrored",
    });
    expect(uiConfigToGenerationOptions(state.config).period).toBe("halved");
    state.updateConfig({ handRelationship: "unison" });
    expect(uiConfigToGenerationOptions(state.config).period).toBe("quartered");
  });

  it("reset puts the relationship back to Free", () => {
    const state = createGenerationConfigState();
    state.updateConfig({
      handRelationship: "opposite",
      handRelationshipInverted: true,
    });
    state.resetConfig();
    expect(state.config.handRelationship).toBe("free");
    expect(state.config.handRelationshipInverted).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/state/generate-config-hand-relationship.test.ts`
Expected: FAIL ("starts Free" gets undefined; round-trip gets undefined).

- [ ] **Step 3: Serialize, load, default**

In `src/lib/features/create/generate/state/generate-config.svelte.ts`:

Add to the imports:

```ts
import {
  DEFAULT_HAND_RELATIONSHIP,
  type HandRelationship,
} from "$lib/shared/create/domain/hand-relationship";
```

In `interface SerializedConfig`, after `motionTypeFilter?: GenerationMotionTypeFilter;` add:

```ts
  // Hand relationship
  handRelationship?: HandRelationship;
  handRelationshipInverted?: boolean;
```

In `saveConfig`, in the `serialized` literal after `motionTypeFilter: config.motionTypeFilter,` add:

```ts
      handRelationship: config.handRelationship,
      handRelationshipInverted: config.handRelationshipInverted,
```

In `loadConfig`, after the `if (data.motionTypeFilter !== undefined) { ... }` block add:

```ts
if (data.handRelationship !== undefined) {
  result.handRelationship = data.handRelationship;
}
if (data.handRelationshipInverted !== undefined) {
  result.handRelationshipInverted = data.handRelationshipInverted;
}
```

In `DEFAULT_CONFIG`, after `...DEFAULT_GENERATION_STYLE,` add:

```ts
  handRelationship: DEFAULT_HAND_RELATIONSHIP,
  handRelationshipInverted: false,
```

- [ ] **Step 4: Guard the normalizer**

In `src/lib/features/create/generate/domain/generator-persistence-normalizer.ts`, add the import:

```ts
import { isHandRelationship } from "$lib/shared/create/domain/hand-relationship";
```

and inside `normalizePersistedGenerationConfig`, after the `delete normalized.turnPattern;` line and its comment, add:

```ts
// A setup or session saved by a build that knew a relationship this one
// does not (or a corrupted value) must not reach the engine. Drop it so the
// default wins; a well-formed value passes through untouched.
if (
  value.handRelationship !== undefined &&
  !isHandRelationship(value.handRelationship)
) {
  delete normalized.handRelationship;
}
if (
  value.handRelationshipInverted !== undefined &&
  typeof value.handRelationshipInverted !== "boolean"
) {
  delete normalized.handRelationshipInverted;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/state/generate-config-hand-relationship.test.ts src/lib/features/create/generate/state/generate-config-legacy.test.ts src/lib/features/create/generate/state/__tests__/generate-config-noop-writes.test.ts src/lib/features/create/generate/domain/__tests__/setup-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(generate): persist the hand relationship with the generation config" -- src/lib/features/create/generate/state/generate-config.svelte.ts src/lib/features/create/generate/domain/generator-persistence-normalizer.ts src/lib/features/create/generate/state/generate-config-hand-relationship.test.ts
```

---

### Task 7: Customize card summary

**Files:**

- Modify: `src/lib/features/create/generate/components/cards/customize-summary.ts` (`CustomizeSummaryInput` ~line 73-79; `buildCustomizeSummary` after the Dashes fact ~line 124)
- Modify: `src/lib/features/create/generate/components/cards/__tests__/customize-summary.test.ts`

**Interfaces:**

- Produces: `CustomizeSummaryInput.handRelationship?: HandRelationship`, `CustomizeSummaryInput.handRelationshipInverted?: boolean`; fact `Relationship: <describeHandRelationship>` when not Free.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe` of `customize-summary.test.ts` (or as a new `describe("hand relationship fact", ...)` at the end of the file):

```ts
describe("hand relationship fact", () => {
  it("names the relationship when it is not Free", () => {
    const summary = buildCustomizeSummary({
      ...inputFrom(PRODUCTION_STYLE_BASELINE),
      handRelationship: "mirrored",
      handRelationshipInverted: true,
    });
    expect(summary.facts).toContain("Relationship: Mirrored, inverted");
    expect(summary.isDefault).toBe(false);
  });

  it("says nothing for Free, even with the inverted flag set", () => {
    const summary = buildCustomizeSummary({
      ...inputFrom(PRODUCTION_STYLE_BASELINE),
      handRelationship: "free",
      handRelationshipInverted: true,
    });
    expect(summary.facts.some((f) => f.startsWith("Relationship:"))).toBe(
      false
    );
    expect(summary.isDefault).toBe(true);
  });

  it("orders the fact after the style axes", () => {
    const summary = buildCustomizeSummary({
      ...inputFrom({
        ...PRODUCTION_STYLE_BASELINE,
        constraintPreset: "choppy",
      }),
      handRelationship: "unison",
    });
    expect(summary.facts.slice(0, 2)).toEqual([
      "Props: Choppy",
      "Relationship: Unison",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/components/cards/__tests__/customize-summary.test.ts`
Expected: FAIL, facts do not contain the relationship.

- [ ] **Step 3: Add the fact**

In `customize-summary.ts`, add the import:

```ts
import {
  DEFAULT_HAND_RELATIONSHIP,
  describeHandRelationship,
  type HandRelationship,
} from "$lib/shared/create/domain/hand-relationship";
```

In `interface CustomizeSummaryInput`, after `motionTypeFilter: DashFilter;` add:

```ts
  /** Free by default; absent means Free. */
  handRelationship?: HandRelationship;
  handRelationshipInverted?: boolean;
```

In `buildCustomizeSummary`, after the Dashes `if` block and before `const options = input.startEndOptions;`, add:

```ts
// The relationship has no per-surface baseline: Free is the untouched value
// everywhere. "Hands:" is taken by the hand-path axis above, hence
// "Relationship:".
const relationship = input.handRelationship ?? DEFAULT_HAND_RELATIONSHIP;
if (relationship !== DEFAULT_HAND_RELATIONSHIP) {
  push(
    `Relationship: ${describeHandRelationship(relationship, input.handRelationshipInverted ?? false)}`
  );
}
```

Also update the doc comment above `buildCustomizeSummary` from "style, start/end positions, orientation, letter constraints" to "style, hand relationship, start/end positions, orientation, letter constraints".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/components/cards/__tests__/customize-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(generate): summarize the hand relationship on the Customize card" -- src/lib/features/create/generate/components/cards/customize-summary.ts src/lib/features/create/generate/components/cards/__tests__/customize-summary.test.ts
```

---

### Task 8: Handler plumbing and the drill screen

**Files:**

- Modify: `src/lib/shared/create/domain/generator-contract-types.ts` (~line 40-44)
- Modify: `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte` (handlers ~line 488-501; handlers object ~line 574-576)
- Modify: `src/lib/features/create/generate/shared/services/card-configurator.ts` (customize props ~line 219-234)
- Modify: `src/lib/shared/create/state/panel-coordination-state.svelte.ts` (`CustomizeOverlayProps` ~line 159-185)
- Modify: `src/lib/features/create/generate/components/cards/CustomizeCard.svelte`
- Modify: `src/lib/features/create/generate/components/modals/CustomizeDrawer.svelte`
- Modify: `src/lib/features/create/generate/components/cards/CustomizeExpandedOverlay.svelte`
- Create: `src/lib/features/create/generate/components/cards/HandRelationshipPanel.svelte`

**Interfaces:**

- Consumes: Task 4 vocabulary, Task 6 defaults (`GENERATE_DEFAULT_CONFIG.handRelationship`), Task 7 summary input.
- Produces: handlers `handleHandRelationshipChange(v: HandRelationship)` and `handleHandRelationshipInvertedChange(v: boolean)`; card and overlay props `handRelationship`, `handRelationshipInverted`, `onHandRelationshipChange`, `onHandRelationshipInvertedChange` (all optional so the public Composer demo, which renders `CustomizeCard` without them, is untouched and shows no row).

- [ ] **Step 1: Contract types**

In `src/lib/shared/create/domain/generator-contract-types.ts`, add the import:

```ts
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
```

and after the `handleMotionTypeFilterChange?: (...) => void;` entry add:

```ts
  // Hand relationship handlers (Customize drill row)
  handleHandRelationshipChange?: (v: HandRelationship) => void;
  handleHandRelationshipInvertedChange?: (v: boolean) => void;
```

- [ ] **Step 2: Container handlers**

In `CardBasedSettingsContainer.svelte`, add the import:

```ts
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
```

After `handleMotionTypeFilterChange` add:

```ts
function handleHandRelationshipChange(v: HandRelationship) {
  updateConfig({ handRelationship: v });
}

function handleHandRelationshipInvertedChange(v: boolean) {
  updateConfig({ handRelationshipInverted: v });
}
```

In the handlers object passed to `buildCardDescriptors`, after `handleMotionTypeFilterChange,` add:

```ts
        handleHandRelationshipChange,
        handleHandRelationshipInvertedChange,
```

- [ ] **Step 3: Card descriptor**

In `card-configurator.ts`, in the `id: "customize"` props, after `onMotionTypeFilterChange: handlers.handleMotionTypeFilterChange,` add:

```ts
        handRelationship: config.handRelationship,
        handRelationshipInverted: config.handRelationshipInverted,
        onHandRelationshipChange: handlers.handleHandRelationshipChange ?? null,
        onHandRelationshipInvertedChange:
          handlers.handleHandRelationshipInvertedChange ?? null,
```

- [ ] **Step 4: Overlay props contract**

In `panel-coordination-state.svelte.ts`, add the import:

```ts
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
```

and in `interface CustomizeOverlayProps`, after `onMotionTypeFilterChange: ...;` add:

```ts
  /** Absent on surfaces that do not offer the row (public Composer demo). */
  handRelationship?: HandRelationship;
  handRelationshipInverted?: boolean;
  onHandRelationshipChange?: ((v: HandRelationship) => void) | null;
  onHandRelationshipInvertedChange?: ((v: boolean) => void) | null;
```

- [ ] **Step 5: CustomizeCard**

In `CustomizeCard.svelte`:

Add the import:

```ts
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
```

In the `$props` destructuring, after `onMotionTypeFilterChange,` add:

```ts
    handRelationship = "free",
    handRelationshipInverted = false,
    onHandRelationshipChange = null,
    onHandRelationshipInvertedChange = null,
```

In the props type, after `onMotionTypeFilterChange: ...;` add:

```ts
    handRelationship?: HandRelationship;
    handRelationshipInverted?: boolean;
    onHandRelationshipChange?: ((v: HandRelationship) => void) | null;
    onHandRelationshipInvertedChange?: ((v: boolean) => void) | null;
```

In the `summary` derived, add to the input object after `motionTypeFilter,`:

```ts
        handRelationship,
        handRelationshipInverted,
```

In `openOverlay()`, after `onMotionTypeFilterChange,` add:

```ts
      handRelationship,
      handRelationshipInverted,
      onHandRelationshipChange,
      onHandRelationshipInvertedChange,
```

- [ ] **Step 6: CustomizeDrawer pass-through**

In `CustomizeDrawer.svelte`, inside `<CustomizeExpandedOverlay ... />`, after `motionTypeFilter={overlayProps.motionTypeFilter}` add:

```svelte
handRelationship={overlayProps.handRelationship}
handRelationshipInverted={overlayProps.handRelationshipInverted}
onHandRelationshipChange={overlayProps.onHandRelationshipChange}
onHandRelationshipInvertedChange={overlayProps.onHandRelationshipInvertedChange}
```

- [ ] **Step 7: The panel component**

Create `src/lib/features/create/generate/components/cards/HandRelationshipPanel.svelte`:

```svelte
<!--
HandRelationshipPanel.svelte - the Hand Relationship drill screen.

One SegmentedControl for the relationship (exactly one is active, so it is
the owner per chip-primitives.md) and one FilterChipBase toggle for Inverted.
The hints stack in one grid cell so switching options never moves the toggle.
-->
<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import {
    HAND_RELATIONSHIPS,
    HAND_RELATIONSHIP_HINTS,
    HAND_RELATIONSHIP_INVERTED_HINT,
    HAND_RELATIONSHIP_LABELS,
    type HandRelationship,
  } from "$lib/shared/create/domain/hand-relationship";

  let {
    relationship,
    inverted,
    haptic = null,
    onRelationshipChange,
    onInvertedChange,
  }: {
    relationship: HandRelationship;
    inverted: boolean;
    haptic?: HapticFeedback | null;
    onRelationshipChange: (v: HandRelationship) => void;
    onInvertedChange: (v: boolean) => void;
  } = $props();

  const options = HAND_RELATIONSHIPS.map((value) => ({
    value,
    label: HAND_RELATIONSHIP_LABELS[value],
  }));

  function handleRelationship(v: HandRelationship) {
    haptic?.trigger("selection");
    onRelationshipChange(v);
  }

  function handleInverted() {
    haptic?.trigger("selection");
    onInvertedChange(!inverted);
  }
</script>

<div class="relationship-panel">
  <SegmentedControl
    {options}
    value={relationship}
    onchange={handleRelationship}
    size="sm"
    density="compact"
    semantics="radiogroup"
    ariaLabel="Hand relationship"
  />
  <span class="hint">
    {#each HAND_RELATIONSHIPS as value (value)}
      <span class="hint-layer" class:live={relationship === value}
        >{HAND_RELATIONSHIP_HINTS[value]}</span
      >
    {/each}
  </span>
  <div class="inverted-row">
    <FilterChipBase
      label="Inverted"
      mode="toggle"
      emphasis="solid"
      active={inverted}
      disabled={relationship === "free"}
      onclick={handleInverted}
    />
    <span class="inverted-hint">{HAND_RELATIONSHIP_INVERTED_HINT}</span>
  </div>
</div>

<style>
  .relationship-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    flex: 1;
    justify-content: center;
  }

  /* Every hint is stacked in one grid cell so the block is always as tall as
     its longest line; picking an option cannot shove the toggle around. */
  .hint {
    display: grid;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.5);
  }

  .hint-layer {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .hint-layer.live {
    visibility: visible;
  }

  .inverted-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .inverted-hint {
    flex: 1 1 200px;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.5);
  }
</style>
```

- [ ] **Step 8: The overlay row and screen**

In `CustomizeExpandedOverlay.svelte`:

Add imports:

```ts
import HandRelationshipPanel from "./HandRelationshipPanel.svelte";
import {
  describeHandRelationship,
  type HandRelationship,
} from "$lib/shared/create/domain/hand-relationship";
```

In the `$props` destructuring, after `onMotionTypeFilterChange,` add:

```ts
    handRelationship = "free",
    handRelationshipInverted = false,
    onHandRelationshipChange = null,
    onHandRelationshipInvertedChange = null,
```

In the props type, after `onMotionTypeFilterChange: ...;` add:

```ts
    handRelationship?: HandRelationship;
    handRelationshipInverted?: boolean;
    onHandRelationshipChange?: ((v: HandRelationship) => void) | null;
    onHandRelationshipInvertedChange?: ((v: boolean) => void) | null;
```

After the `localMotionTypeFilter` state add:

```ts
// ─── Local state for the hand relationship (instant UI feedback) ───
let localHandRelationship = $state<HandRelationship>(
  untrack(() => handRelationship)
);
let localHandRelationshipInverted = $state<boolean>(
  untrack(() => handRelationshipInverted)
);
```

Replace the `drillItems` derived with:

```ts
// The rows. Start orientation used to be a fourth, which asked the user
// to set where the props start in one place and which way they point in
// another — the same decision, split in two. It now lives under Start
// Position, where the picker is already drawing the props it describes.
//
// End Position stays present and locked when LOOP owns it — dropping the row
// would change the list length and move the row below it, and leave a user
// who saw the setting once with no explanation.
//
// Hand Relationship appears only on surfaces that pass a change handler;
// the public Composer demo does not offer it.
const drillItems = $derived<SettingsDrillItem[]>([
  { id: "style", label: "Style", value: styleSummary },
  { id: "startPos", label: "Start Position", value: startPosDisplay },
  {
    id: "endPos",
    label: "End Position",
    value: endPosDisplay,
    disabled: !isFreeformMode,
    disabledReason: "Set by LOOP",
  },
  ...(onHandRelationshipChange
    ? [
        {
          id: "hands",
          label: "Hand Relationship",
          value: describeHandRelationship(
            localHandRelationship,
            localHandRelationshipInverted
          ),
        },
      ]
    : []),
]);
```

(Keep the existing em dashes in that comment exactly as they are; they predate this change. Do not add new ones.)

In `performResetAll`, after `localMotionTypeFilter = GENERATE_DEFAULT_CONFIG.motionTypeFilter;` add:

```ts
localHandRelationship = GENERATE_DEFAULT_CONFIG.handRelationship;
localHandRelationshipInverted =
  GENERATE_DEFAULT_CONFIG.handRelationshipInverted;
```

In the `detail` snippet, after the `{:else if id === "endPos"}` block's closing `</div>` and before `{/if}`, add:

```svelte
        {:else if id === "hands"}
          <div class="drill-fill spread">
            <HandRelationshipPanel
              relationship={localHandRelationship}
              inverted={localHandRelationshipInverted}
              haptic={hapticService}
              onRelationshipChange={(v) => {
                localHandRelationship = v;
                onHandRelationshipChange?.(v);
              }}
              onInvertedChange={(v) => {
                localHandRelationshipInverted = v;
                onHandRelationshipInvertedChange?.(v);
              }}
            />
          </div>
```

Change the `ConfirmDialog` message to:

```
message="Style, hand relationship, start positions, level, length and LOOP settings all go back to their defaults. This can't be undone."
```

Update the header comment's first line list from "Style, Start Position, and End Position" to "Style, Start Position, End Position, and Hand Relationship".

- [ ] **Step 9: Run the touched tests and a type pass**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate`
Expected: PASS (no test exercises the new Svelte directly; this guards the descriptor and summary).

Run: `npm run check:fast`
Expected: 0 errors. Fix any type error in the files above before continuing; do not touch unrelated files.

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(generate): Hand Relationship row in the Customize drawer" -- src/lib/shared/create/domain/generator-contract-types.ts src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte src/lib/features/create/generate/shared/services/card-configurator.ts src/lib/shared/create/state/panel-coordination-state.svelte.ts src/lib/features/create/generate/components/cards/CustomizeCard.svelte src/lib/features/create/generate/components/modals/CustomizeDrawer.svelte src/lib/features/create/generate/components/cards/CustomizeExpandedOverlay.svelte src/lib/features/create/generate/components/cards/HandRelationshipPanel.svelte
```

---

### Task 9: LOOP card reads the coerced period

**Files:**

- Modify: `src/lib/features/create/generate/components/cards/loop-card-display.ts` (`LoopCardDisplayInput` ~line 25-33; `resolveLoopConfig` call ~line 129)
- Modify: `src/lib/features/create/generate/components/cards/ConsolidatedLOOPCard.svelte` (props ~line 22-43; `buildLoopCardDisplay` call ~line 56-63)
- Modify: `src/lib/features/create/generate/shared/services/card-configurator.ts` (`id: "loop"` props ~line 242-255)
- Modify: `src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts`

**Interfaces:**

- Produces: `LoopCardDisplayInput.handRelationship?: HandRelationship`; `ConsolidatedLOOPCard` prop `handRelationship?: HandRelationship`.

- [ ] **Step 1: Write the failing tests**

In `loop-card-display.test.ts`, add inside the first `describe` (the one exercising `buildLoopCardDisplay`):

```ts
it("shows halved when a reflection relationship coerces quartered rotation", () => {
  const display = buildLoopCardDisplay({
    loopEnabled: true,
    loopType: LOOPType.ROTATED,
    period: Period.QUARTERED,
    handRelationship: "mirrored",
  });
  expect(display.rotationPeriod).toBe(Period.HALVED);
});

it("keeps quartered for a relationship that commutes with rotation", () => {
  const display = buildLoopCardDisplay({
    loopEnabled: true,
    loopType: LOOPType.ROTATED,
    period: Period.QUARTERED,
    handRelationship: "unison",
  });
  expect(display.rotationPeriod).toBe(Period.QUARTERED);
});
```

and in the `card-configurator LOOP descriptor` test, set `handRelationship: "flipped"` in the `config` literal (replacing the `"free"` written in Task 5) and extend the `toMatchObject` expectation on `loopCard!.props` with:

```ts
      handRelationship: "flipped",
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts`
Expected: FAIL: rotationPeriod is quartered; the descriptor lacks `handRelationship`.

- [ ] **Step 3: Thread it**

In `loop-card-display.ts`, add the import:

```ts
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
```

In `interface LoopCardDisplayInput`, after `reflectionAxis?: ReflectionAxis;` add:

```ts
  /** Mirrored and Flipped hands coerce quartered rotation and diagonal axes. */
  handRelationship?: HandRelationship;
```

Change the `resolveLoopConfig` call to:

```ts
const resolved = resolveLoopConfig(
  input.loopType,
  input.period as string | undefined,
  {
    inversionInterval: input.inversionInterval,
    inversionMode: input.inversionMode,
    reflectionAxis: input.reflectionAxis,
    handRelationship: input.handRelationship,
  }
);
```

In `ConsolidatedLOOPCard.svelte`, add the import:

```ts
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
```

add `handRelationship,` to the destructuring after `reflectionAxis,`, add `handRelationship?: HandRelationship;` to the props type after `reflectionAxis?: ReflectionAxis;`, and add `handRelationship,` to the `buildLoopCardDisplay({...})` call after `reflectionAxis,`.

In `card-configurator.ts`, in the `id: "loop"` props after `reflectionAxis: config.reflectionAxis,` add:

```ts
        handRelationship: config.handRelationship,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(generate): LOOP card shows the period a hand relationship leaves" -- src/lib/features/create/generate/components/cards/loop-card-display.ts src/lib/features/create/generate/components/cards/ConsolidatedLOOPCard.svelte src/lib/features/create/generate/shared/services/card-configurator.ts src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts
```

---

### Task 10: Type gate, browser verification, integration

**Files:** none new. Evidence only.

- [ ] **Step 1: Type gate once**

Run (worktree root): `npm run check:fast`
Expected: 0 errors, 0 new warnings in touched files.

- [ ] **Step 2: Full app test run for the touched areas**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate src/lib/shared/create tests/unit/services`
Expected: PASS.

- [ ] **Step 3: Task-owned dev server from the worktree**

Check the resource budget first (`(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue` must be above 4096; at most two agent Vite servers running). Copy the primary's `.cert/` into the worktree so the server is HTTPS (`.cert/` is gitignored). Switch the session directory to the worktree, then start the `verify` configuration from the worktree's `.claude/launch.json` with `preview_start` (port 5185, `https://localhost:5185`). If 5185 is taken, use `navigate` against a server started on the next free port.

- [ ] **Step 4: Verify in the browser**

Open `https://localhost:5185/create/generate` (the Generate tab; if the route differs, follow the app's create navigation to Generate).

1. Customize card > Hand Relationship row reads "Free". Screenshot at desktop.
2. Open the row: five segments in the `SegmentedControl` pattern, hint under them, Inverted toggle disabled. Pick Mirrored: hint changes, Inverted enables, row value reads "Mirrored". Turn Inverted on: row reads "Mirrored, inverted". Card summary shows "Relationship: Mirrored, inverted".
3. `resize_window` to the mobile preset (375x812), reload, reopen the row as a bottom sheet. All five labels legible, no horizontal overflow. If a label truncates, change the `SegmentedControl` in `HandRelationshipPanel.svelte` to `columns={3}` and re-check. Screenshot.
4. Back at desktop, with LOOP on, rotated, quartered: the LOOP card's rhythm reads halved while Mirrored is on and quartered again when Free.
5. Set Mirrored (not inverted), diamond, L1, LOOP off, length 8, Generate. Read the produced steps from the workspace with `javascript_tool` (find the current sequence in localStorage or IndexedDB; the key holds a sequence JSON with `steps[].motions.left/right`). Confirm for every step after the start that `left.startLocation` is the north-south reflection of `right.startLocation`, same for `endLocation`, and the motion types match. Switch the grid to box and repeat once. Screenshot the generated sequence.
6. Set Unison and generate once more: every step's letters are G or H (or Ψ-, β).
7. `read_console_messages` with `onlyErrors: true`: no new errors from the Customize drawer or generation.

Stop the task-owned server in the same turn and switch the session directory back to the primary checkout.

- [ ] **Step 5: Bring the branch current and integrate**

From the worktree: `git status --short` must be clean apart from ignored files. Then `git merge main` (or `git rebase main` if the history is linear and nothing else touched it); rerun the engine suite and the Task 10 Step 2 app tests only if the merge touched `packages/sequence-engine` or `src/lib/features/create/generate`.

From the primary checkout `C:/tka-platform`:

```powershell
npm run wt:finish -- codex/hand-relationship-generate --route /create/generate
```

If a gate fails, leave the branch and worktree intact and report the exact blocker.

- [ ] **Step 6: Feedback item**

```bash
node scripts/fetch-feedback.js f2SKgV5rqEMJoHhTGggD in-review "Hand Relationship row in Generate's Customize drawer: Free / Mirrored / Flipped / Unison / Opposite plus Inverted. Hard per-step engine constraint; turns stay independent; quartered rotation and diagonal axes coerce to a valid LOOP." --user-notes "Generate can now keep the left hand as the mirror image of the right (or flipped, in unison, or opposite) on every step. Open Customize in the Generate tab and pick a Hand Relationship."
```
