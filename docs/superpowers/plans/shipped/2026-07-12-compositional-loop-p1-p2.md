# Compositional LOOP System — P1 (Engine) + P2 (Generation & Lifecycle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute per-component-period LOOP specs (expand + overlay modes, canonical nesting) end-to-end: engine execution → generation plumbing → spec lifecycle (write on generate, clear on edit) → spec-first display resolution.

**Architecture:** Extend `ComponentSpec` with `mode`, fix the fused-stage ordering to the canonical law, add an in-place overlay-inversion stage, wire the dormant `options.loopSpec` through `SequenceBuilder`, store the wire-form spec on `SequenceData`, clear it at the two beat-mutation chokepoints, and teach the display resolver periods/mismatch-flagging. Spec: `docs/superpowers/specs/2026-07-12-compositional-loop-spec-design.md`.

**Tech Stack:** TypeScript, vitest (engine has its own config: `cd packages/sequence-engine && npx vitest run`; app: `npx vitest run --config tests/config/vitest.config.ts <file>`), pnpm workspaces (`@tka/sequence-engine`), Svelte 5 app side.

**Execution rules (every task):**
- Re-read this plan file at task start. The plan is authority, not memory.
- Commit with explicit pathspec: `git commit -m "..." -- <files>`. NEVER bare `git commit`, never `git add -A`. The index is shared with other agents.
- Prove completion with tool output (test run). Claims without output are rejected.
- Engine rebuild after engine src changes so app-side tests see it: `npm run build:packages` (root).
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01LyTZ3ZYsAdJGH6ibqSnjEj`

---

## Canonical law (reference for all tasks)

- Stage order inside `executeSymmetricSpec`: **ROTATED stage → fused expand-groups (groups containing mirror/flip/swap before invert-only groups; ascending period within each class) → overlay stages last**.
- Same-period fuseables stay fused in ONE group (load-bearing: fused mirror+invert cancels rotation-direction flips; sequential application would change semantics AND length). The legacy path (`loopSpecFromLegacy`, one period for all) therefore hits exactly one fused group and is bit-for-bit unaffected by the reordering.
- Overlay v1: INVERTED only. Overlay = partition final letter beats into `period` equal blocks; on ODD block indices flip `motionType` pro↔anti and `rotationDirection` cw↔ccw in place (dash/static motionType untouched, but rotation still flips only for pro/anti — leave dash/static rotation as-is); then recompute the orientation chain from the start position forward via `updateStepOrientations`. Letters are NOT re-derived by the engine stage (callers own letter re-derivation, as SequenceBuilder already does).

---

## P1 — Engine

### Task 1: `mode` field on ComponentSpec + wire + validation rule

**Files:**
- Modify: `packages/sequence-engine/src/loop/loop-spec.ts`
- Test: `packages/sequence-engine/tests/loop/spec/loop-spec-mode.test.ts` (create; mirror the existing test layout under `packages/sequence-engine/tests/loop/`)

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  LOOPComponent,
  loopSpecToWire,
  loopSpecFromWire,
  validateLOOPSpec,
  type LOOPSpec,
} from "../../../src/loop/loop-spec.js";

function symmetric(components: Array<[LOOPComponent, { period: number; mode?: "expand" | "overlay" }]>): LOOPSpec {
  const map = new Map(components);
  return { blue: { components: map }, red: { components: map } };
}

describe("ComponentSpec.mode", () => {
  it("round-trips mode through wire format", () => {
    const spec = symmetric([
      [LOOPComponent.ROTATED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 4, mode: "overlay" }],
    ]);
    const back = loopSpecFromWire(loopSpecToWire(spec));
    expect(back.blue!.components.get(LOOPComponent.INVERTED)!.mode).toBe("overlay");
    expect(back.blue!.components.get(LOOPComponent.ROTATED)!.mode).toBeUndefined();
  });

  it("accepts overlay on INVERTED", () => {
    const spec = symmetric([[LOOPComponent.INVERTED, { period: 4, mode: "overlay" }]]);
    expect(validateLOOPSpec(spec)).toEqual([]);
  });

  it("rejects overlay on location-moving components", () => {
    const spec = symmetric([[LOOPComponent.MIRRORED, { period: 2, mode: "overlay" }]]);
    const errors = validateLOOPSpec(spec);
    expect(errors.some((e) => e.rule === "overlay_legality")).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/sequence-engine && npx vitest run tests/loop/spec/loop-spec-mode.test.ts`
Expected: FAIL (mode not carried through wire; no overlay_legality rule).

- [x] **Step 3: Implement**

In `loop-spec.ts`:

```ts
/** How a component is applied: expand multiplies length by `period`;
 *  overlay applies in place over the final sequence (x1 length).
 *  Absent = "expand" (all pre-existing specs unchanged). */
export type ComponentMode = "expand" | "overlay";

export interface ComponentSpec {
  readonly period: number;
  readonly domain?: LOOPDomain;
  readonly mode?: ComponentMode;
}

export interface ComponentSpecWire {
  period: number;
  domain?: LOOPDomain;
  mode?: ComponentMode;
}
```

In `propSpecToWire`: after the existing period/domain copy, add `if (value.mode !== undefined) entry.mode = value.mode;`. In `propSpecFromWire`: carry `mode` back the same way.

In `validateLOOPSpec`, inside the per-component loop, add:

```ts
if (compSpec.mode === "overlay" && comp !== LOOPComponent.INVERTED) {
  errors.push({
    rule: "overlay_legality",
    message: `${propName}.${comp}: overlay mode is only supported for INVERTED (location-preserving)`,
  });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/sequence-engine && npx vitest run tests/loop/spec/loop-spec-mode.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git commit -m "feat(engine): ComponentSpec.mode — expand vs overlay, wire round-trip, overlay_legality validation" -- packages/sequence-engine/src/loop/loop-spec.ts packages/sequence-engine/tests/loop/spec/loop-spec-mode.test.ts
```

---

### Task 2: Canonical fused-stage order in executeSymmetricSpec

**Files:**
- Modify: `packages/sequence-engine/src/loop/execution/spec-executor.ts` (replace the descending sort in `groupFuseableByPeriod`, line ~137)
- Test: `packages/sequence-engine/tests/loop/execution/canonical-stage-order.test.ts` (create)

- [x] **Step 1: Write the failing test**

The test pins the observable consequence: `{mir:2, inv:4}` must run mirror FIRST (mirror innermost), producing 16 beats shaped `[X(4), I(X)(4), X(4), I(X)(4)]` where X = seed(2)+mirrored(2) — i.e. beats 5–8 are the pro↔anti flip of beats 1–4 at the same block positions. Under the old descending order, invert ran first and the shape was `[s, I(s), s, I(s), M(...)]` (beats 5–8 equal to beats 1–4 in letters but NOT type-flipped).

```ts
import { describe, expect, it } from "vitest";
import { executeSymmetricSpec } from "../../../src/loop/execution/spec-executor.js";
import { LOOPComponent, type PropLOOPSpec } from "../../../src/loop/loop-spec.js";
import type { SequenceStep } from "../../../src/core/types/sequence-engine-types.js";

// Minimal 2-beat closed-under-mirror seed: startPos + 2 letter steps whose
// motions are pro/anti (so inversion is observable). Build hand-rolled steps
// with the fields the executors touch (motions, positions, stepNumber, letter).
function step(n: number, letter: string, sp: string, ep: string, blue: any, red: any): SequenceStep {
  return { stepNumber: n, letter, startPosition: sp, endPosition: ep, motions: { blue, red } } as unknown as SequenceStep;
}
const m = (motionType: string, rotationDirection: string, startLocation: string, endLocation: string) => ({
  motionType, rotationDirection, startLocation, endLocation,
  startOrientation: "in", endOrientation: "in", turns: 0, color: "blue",
});

function makeSeed(): SequenceStep[] {
  return [
    step(0, "", "gamma13", "gamma13", m("static", "noRotation", "w", "w"), m("static", "noRotation", "s", "s")),
    step(1, "Z", "gamma13", "beta5", m("anti", "cw", "w", "s"), m("static", "noRotation", "s", "s")),
    step(2, "Θ", "beta5", "gamma5", m("pro", "ccw", "s", "e"), m("static", "noRotation", "s", "s")),
  ];
}

function spec(entries: Array<[LOOPComponent, { period: number; mode?: "expand" | "overlay" }]>): PropLOOPSpec {
  return { components: new Map(entries) };
}

describe("canonical stage order", () => {
  it("runs mirror/flip/swap groups before invert-only groups", () => {
    const result = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 4 }],
    ]));
    const beats = result.slice(1);
    expect(beats).toHaveLength(16);
    // Canonical: mirror first (2->4 = block X), then invert@4 alternates blocks
    // of 4. Beats 5-8 must be the motionType-flip of beats 1-4.
    for (let i = 0; i < 4; i++) {
      const base = beats[i]!.motions.blue.motionType;
      const inv = beats[i + 4]!.motions.blue.motionType;
      if (base === "pro") expect(inv).toBe("anti");
      if (base === "anti") expect(inv).toBe("pro");
    }
  });

  it("keeps same-period components fused in one group (legacy smear unaffected)", () => {
    const result = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 2 }],
    ]));
    // One fused group => x2 only: 2 seed beats -> 4 beats.
    expect(result.slice(1)).toHaveLength(4);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/sequence-engine && npx vitest run tests/loop/execution/canonical-stage-order.test.ts`
Expected: first test FAILS (descending order runs invert innermost); second PASSES (guards against overcorrection).

- [x] **Step 3: Implement**

In `spec-executor.ts`, replace the return of `groupFuseableByPeriod`:

```ts
  // Canonical stage order: groups containing MIRROR/FLIP/SWAP run before
  // invert-only groups (inversion is the outermost layer); ascending period
  // within each class. Same-period components remain fused in one group —
  // fused mirror+invert cancels rotation flips, which sequential stages
  // would not (and the legacy one-period-for-all path depends on it).
  return new Map(
    [...groups.entries()].sort(([pa, fa], [pb, fb]) => {
      const invOnlyA = fa.invert && !fa.mirror && !fa.flip && !fa.swap ? 1 : 0;
      const invOnlyB = fb.invert && !fb.mirror && !fb.flip && !fb.swap ? 1 : 0;
      if (invOnlyA !== invOnlyB) return invOnlyA - invOnlyB;
      return pa - pb;
    }),
  ) as Map<number, FusedTransformFlags>;
```

Also in `groupFuseableByPeriod`'s component loop, skip overlay components (they are handled by Task 3's stage): `if (cSpec.mode === "overlay") continue;`

- [x] **Step 4: Run tests**

Run: `cd packages/sequence-engine && npx vitest run tests/loop/execution/canonical-stage-order.test.ts && npx vitest run`
Expected: new tests PASS; full engine suite green (the reorder cannot affect single-group legacy paths — if any existing test fails, STOP and investigate before proceeding).

- [x] **Step 5: Commit**

```bash
git commit -m "feat(engine): canonical fused-stage order — mirror/flip/swap before invert-only, ascending period" -- packages/sequence-engine/src/loop/execution/spec-executor.ts packages/sequence-engine/tests/loop/execution/canonical-stage-order.test.ts
```

---

### Task 3: Overlay-inversion stage

**Files:**
- Create: `packages/sequence-engine/src/loop/execution/overlay-inversion.ts`
- Modify: `packages/sequence-engine/src/loop/execution/spec-executor.ts` (run overlays last)
- Modify: `packages/sequence-engine/src/loop/index.ts` (export `applyOverlayInversion`)
- Test: `packages/sequence-engine/tests/loop/execution/overlay-inversion.test.ts` (create)

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { executeSymmetricSpec } from "../../../src/loop/execution/spec-executor.js";
import { LOOPComponent, type PropLOOPSpec } from "../../../src/loop/loop-spec.js";
// reuse makeSeed/step/m/spec helpers exactly as in canonical-stage-order.test.ts
// (copy them into this file — tests must be independently readable)

describe("overlay inversion", () => {
  it("applies inversion in place: same positions, motion types flipped on odd blocks", () => {
    const base = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.ROTATED, { period: 2 }],
      [LOOPComponent.MIRRORED, { period: 2 }],
    ]));
    const overlaid = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.ROTATED, { period: 2 }],
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 4, mode: "overlay" }],
    ]));

    expect(overlaid).toHaveLength(base.length); // x1 — no expansion
    const blockSize = (base.length - 1) / 4;
    for (let i = 1; i < base.length; i++) {
      // positions identical everywhere
      expect(overlaid[i]!.startPosition).toBe(base[i]!.startPosition);
      expect(overlaid[i]!.endPosition).toBe(base[i]!.endPosition);
      const odd = Math.floor((i - 1) / blockSize) % 2 === 1;
      const b = base[i]!.motions.blue.motionType;
      const o = overlaid[i]!.motions.blue.motionType;
      if (!odd || b === "dash" || b === "static") expect(o).toBe(b);
      else expect(o).toBe(b === "pro" ? "anti" : "pro");
    }
  });

  it("keeps the orientation chain continuous after overlay", () => {
    const overlaid = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 2, mode: "overlay" }],
    ]));
    for (let i = 2; i < overlaid.length; i++) {
      expect(overlaid[i]!.motions.blue.startOrientation).toBe(overlaid[i - 1]!.motions.blue.endOrientation);
      expect(overlaid[i]!.motions.red.startOrientation).toBe(overlaid[i - 1]!.motions.red.endOrientation);
    }
  });

  it("throws when letter count is not divisible by the overlay period", () => {
    expect(() =>
      executeSymmetricSpec(makeSeed(), spec([
        [LOOPComponent.MIRRORED, { period: 2 }], // 2 -> 4 beats
        [LOOPComponent.INVERTED, { period: 8, mode: "overlay" }], // 4 % 8 != 0
      ]))
    ).toThrow(/divisible/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/sequence-engine && npx vitest run tests/loop/execution/overlay-inversion.test.ts`
Expected: FAIL (overlay components currently treated as expand → length differs).

- [x] **Step 3: Implement `overlay-inversion.ts`**

```ts
/**
 * Overlay inversion — applies INVERTED in place over a completed sequence.
 *
 * Partition the letter beats into `period` equal blocks; on odd blocks flip
 * motionType pro<->anti and rotationDirection cw<->ccw. Hand locations are
 * untouched by construction, so positions and closure are preserved. The
 * orientation chain is recomputed forward from the start position. Letters
 * are NOT re-derived here — callers (SequenceBuilder) own letter lookup.
 *
 * Verified semantics: variant E, 2026-07-12 spec.
 */
import type { SequenceStep } from "../../core/types/sequence-engine-types.js";
import { updateStepOrientations } from "./orientation-helpers.js";

export function applyOverlayInversion(
  sequence: SequenceStep[],
  period: number,
): SequenceStep[] {
  const letterCount = sequence.length - 1; // index 0 = start position
  if (letterCount <= 0) return sequence;
  if (letterCount % period !== 0) {
    throw new Error(
      `Overlay inversion requires the beat count (${letterCount}) to be divisible by the period (${period}).`,
    );
  }
  const blockSize = letterCount / period;

  const invertType = (t: string) => (t === "pro" ? "anti" : t === "anti" ? "pro" : t);
  const flipRot = (d: string) => (d === "cw" ? "ccw" : d === "ccw" ? "cw" : d);

  const out = sequence.map((s) => ({
    ...s,
    motions: { blue: { ...s.motions.blue }, red: { ...s.motions.red } },
  }));

  for (let i = 1; i < out.length; i++) {
    const blockIdx = Math.floor((i - 1) / blockSize);
    if (blockIdx % 2 !== 1) continue;
    for (const color of ["blue", "red"] as const) {
      const motion = out[i]!.motions[color];
      if (motion.motionType === "pro" || motion.motionType === "anti") {
        motion.motionType = invertType(motion.motionType) as typeof motion.motionType;
        motion.rotationDirection = flipRot(motion.rotationDirection) as typeof motion.rotationDirection;
      }
    }
  }

  for (let i = 1; i < out.length; i++) {
    out[i] = updateStepOrientations(out[i]!, out[i - 1]!);
  }
  return out;
}
```

In `executeSymmetricSpec` (spec-executor.ts), after the fused-group loop:

```ts
  // Overlay stages run last, in place (x1 length).
  for (const [comp, cSpec] of spec.components) {
    if (cSpec.mode !== "overlay") continue;
    if (comp !== LOOPComponent.INVERTED) {
      throw new Error(`Overlay mode is not supported for ${comp}`);
    }
    result = applyOverlayInversion(result, cSpec.period);
  }
```

(plus `import { applyOverlayInversion } from "./overlay-inversion.js";`). Also confirm Task 2's `continue` keeps overlay components out of fused groups, and add the same skip to the ROTATED stage guard (`spec.components.get(ROTATED)` — rotation cannot be overlay; validation already rejects it).

Export from `packages/sequence-engine/src/loop/index.ts`:

```ts
export { applyOverlayInversion } from "./execution/overlay-inversion.js";
```

- [x] **Step 4: Run tests**

Run: `cd packages/sequence-engine && npx vitest run tests/loop/execution/overlay-inversion.test.ts && npx vitest run`
Expected: new tests PASS; full suite green.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(engine): overlay-inversion stage — in-place block inversion, x1 length, orientation chain recompute" -- packages/sequence-engine/src/loop/execution/overlay-inversion.ts packages/sequence-engine/src/loop/execution/spec-executor.ts packages/sequence-engine/src/loop/index.ts packages/sequence-engine/tests/loop/execution/overlay-inversion.test.ts
```

---

### Task 4: SequenceBuilder honors `options.loopSpec`

**Files:**
- Modify: `packages/sequence-engine/src/generation/builder/SequenceBuilder.ts`
- Test: `packages/sequence-engine/tests/generation/loop-spec-build.test.ts` (create — follow the CSV-provider pattern from existing generation tests / `scripts/generate-loop-audit-fixtures.mjs`; the diamond CSV lives at `static/data/pictographs/DiamondPictographDataframe.csv` relative to repo root)

Current state: `options.loopSpec?: LOOPSpec` is declared (~line 190) and never read; LOOP extension goes through `extendWithLOOP(result, options.loop, gridMode)` (~line 883) → legacy `loopExecutorSelector.getExecutor(type).executeLOOP(steps, period)`.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SequenceBuilder } from "../../src/generation/index.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { LOOPComponent, type LOOPSpec } from "../../src/loop/loop-spec.js";
import { isSequenceCircular } from "../../src/loop/detection/LOOPDetector.js";

// loadVariations + CsvVariationProvider: copy verbatim from
// scripts/generate-loop-audit-fixtures.mjs (lines 45-97) — same CSV columns.
// CSV path: path.resolve(__dirname, "../../../../static/data/pictographs/DiamondPictographDataframe.csv")

function symmetric(entries: Array<[LOOPComponent, { period: number; mode?: "expand" | "overlay" }]>): LOOPSpec {
  const map = new Map(entries);
  return { blue: { components: map }, red: { components: map } };
}

describe("SequenceBuilder loopSpec path", () => {
  it("builds a rot:2+mir:2 loop with inv:4 overlaid — 16 beats, closed, block-inverted", () => {
    const builder = new SequenceBuilder(new CsvVariationProvider(loadVariations(CSV_PATH)));
    const spec = symmetric([
      [LOOPComponent.ROTATED, { period: 2 }],
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 4, mode: "overlay" }],
    ]);
    // Retry loop: beam search is stochastic; accept first success in 40 attempts.
    let result: any = null;
    for (let i = 0; i < 40 && !result; i++) {
      try {
        const r = builder.build({
          length: 4, gridMode: "diamond", level: 1,
          loop: { type: LOOPType.MIRRORED_ROTATED, period: Period.HALVED, useTargetedGeneration: true },
          loopSpec: spec,
        });
        if (isSequenceCircular(r.sequence)) result = r;
      } catch { /* retry */ }
    }
    expect(result).not.toBeNull();
    const beats = result.sequence.slice(1);
    expect(beats).toHaveLength(16); // 4 seed x2 rot x2 mir, overlay x1
    // Overlay signature: blocks of 4; beats 5-8 are the pro/anti flip of 1-4
    for (let i = 0; i < 4; i++) {
      const b = beats[i].motions.blue.motionType;
      const o = beats[i + 4].motions.blue.motionType;
      if (b === "pro") expect(o).toBe("anti");
      if (b === "anti") expect(o).toBe("pro");
      expect(beats[i + 4].startPosition).toBe(/* rotated+mirrored structure preserved */ beats[i + 4].startPosition);
    }
    // Letters re-derived: no beat keeps a letter inconsistent with its motions
    expect(beats.every((s: any) => s.letter)).toBe(true);
  });
});
```

Note for the implementer: the legacy `loop` option is passed ALONGSIDE `loopSpec` in this test because seam targeting reuses the legacy machinery (see Step 3). The builder must treat `loopSpec` as authoritative for EXECUTION and derive targeting from it.

**Deviation (structural, not just line drift):** `loopSpec` is NOT a sibling top-level `BuildOptions` field — it is declared on `LoopOptions` (nested: `options.loop.loopSpec`), confirmed by the field's own doc-comment ("Compositional LOOPSpec. When present, preferred over type+period by new execution paths.") and by the MCP adapter (`mcp-server/src/core/engine-generation-adapter.ts:201`), which already populates `options.loop.loopSpec = loopSpecFromLegacy(...)` for every LOOP request today. The test therefore passes `loopSpec` nested inside the `loop:` object, not as a sibling of it. This also means the plan's Step 3 guard ("if loopSpec present but options.loop absent, throw") is structurally unreachable — loopSpec can only exist when `options.loop` exists — so it was not added.

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/sequence-engine && npx vitest run tests/generation/loop-spec-build.test.ts`
Expected: FAIL — beats.length is 32 (legacy smear treats inv:4 as an expander) or motion flips absent.

Actual: FAILED for the right reason — 16 beats produced (legacy path coincidentally matches length since ROTATED_MIRRORED already doubles twice), but `beats[i+4]` motionType was NOT flipped (overlay ignored): `AssertionError: expected 'anti' to be 'pro'`.

- [x] **Step 3: Implement**

In `SequenceBuilder.extendWithLOOP` (~line 883), branch on spec:

```ts
  private extendWithLOOP(result: BuildResult, loopOptions: LoopOptions, gridMode: string): BuildResult {
    const loopSpec = this.currentLoopSpec; // stored from options in build()
    const extendedSteps = loopSpec
      ? loopExecutorSelector.executeSpec(result.sequence.map((s) => ({ ...s })), loopSpec)
      : loopExecutorSelector.getExecutor(loopOptions.type)
          .executeLOOP(result.sequence.map((s) => ({ ...s })), loopOptions.period);
    // ... existing letter re-derivation + metadata code unchanged, except:
    // orientationCycleMultiplier — for spec path use the product of expander periods:
    const orientationCycleMultiplier = loopSpec
      ? expanderMultiplier(loopSpec)
      : loopOptions.period === Period.QUARTERED ? 4 : 2;
```

Add module-level helper in SequenceBuilder.ts:

```ts
function expanderMultiplier(spec: LOOPSpec): number {
  let mult = 1;
  const seen = new Set<number>(); // same-period fuseables share one stage
  const prop = spec.blue ?? spec.red;
  if (!prop) return 1;
  const rot = prop.components.get(CanonicalLOOPComponent.ROTATED);
  if (rot && rot.mode !== "overlay") mult *= rot.period;
  for (const [comp, cSpec] of prop.components) {
    if (comp === CanonicalLOOPComponent.ROTATED || comp === CanonicalLOOPComponent.REWOUND) continue;
    if (cSpec.mode === "overlay") continue;
    if (!seen.has(cSpec.period)) { seen.add(cSpec.period); mult *= cSpec.period; }
  }
  return mult;
}
```

(import `LOOPComponent as CanonicalLOOPComponent` from `../../loop/loop-spec.js` — matching the existing import style in `LOOPEndPositionSelector.ts`.)

**Deviation:** implemented without a stashed `this.currentLoopSpec` instance field or the `expanderMultiplier(spec)` module helper above. `extendWithLOOP` already receives `loopOptions` (containing `.loopSpec`) as a direct parameter from both call sites (`buildByWord` ~line 360, `buildByLength` ~line 639) — no re-plumbing through `build()` was needed; branching on `loopOptions.loopSpec` directly is simpler and avoids adding mutable instance state. `validateLOOPSpec(loopSpec)` is called inside `extendWithLOOP` when `loopSpec` is present, throwing a joined `rule: message` error on failure. Seam targeting already reads `loopOptions.type`/`loopOptions.period` directly and is untouched by this branch — no explicit "keep legacy targeting" wiring was needed since nothing about targeting changed.

The `expanderMultiplier` product-of-periods formula was NOT ported into SequenceBuilder.ts: it undercounts/overcounts `orientationCycleMultiplier` for specs where a fuseable component (e.g. INVERTED) shares ROTATED's period with no MIRROR/FLIP present — `executeSymmetricSpec`'s `fuseableAtSamePeriod` branch then absorbs ROTATED's rotation into that ONE fused group (x-period once), not a separate stage, so multiplying `rot.period * cSpec.period` double-counts (e.g. `rotated_inverted` at period 2 would compute 4, but the actual expansion is x2 — verified by tracing `loopSpecFromLegacy("rotated_inverted", 2)` → `{rotated:2, inverted:2}` through `executeSymmetricSpec`). Since `extendWithLOOP` already computes both `seedStepCount` and the post-execution `extendedSteps.length`, `orientationCycleMultiplier` for the spec path is instead derived empirically as `Math.round((extendedSteps.length - 1) / (seedStepCount - 1))` — correct by construction for whatever grouping/overlay rules `executeSymmetricSpec` actually applied, with no duplicated logic to drift out of sync. The legacy type+period formula is preserved unchanged for the non-spec path (zero drift).

Also widened the letter re-derivation loop: on the spec path only, re-derive letters for ALL letter beats (`i = 1..end`), not just beats beyond the original seed. An overlay stage applies over the fully-expanded sequence partitioned into `period` equal blocks, which can flip beats that fall within the nominal "seed" range whenever the overlay period doesn't divide the seed length evenly — re-deriving an unaffected beat's letter from its own (unchanged) motions is a no-op, so this is safe. The legacy path's original bounds (`i >= seedStepCountForLetters`) are untouched.

- [x] **Step 4: Run tests + rebuild**

Run: `cd packages/sequence-engine && npx vitest run && cd ../.. && npm run build:packages`
Expected: engine suite green incl. new test; packages build clean.

Actual: 282/282 engine tests passed (36 files). `npm run build:packages` → `tsc --build packages/tsconfig.build.json` succeeded, no output (clean).

- [x] **Step 5: Run the app-side production fixture audit (zero-drift proof)**

Run: `npx vitest run tests/unit/loop/real-loop-detector-audit.test.ts --config tests/config/vitest.config.ts`
Expected: PASS — identical cell results to before P1 (legacy paths untouched). If any cell changed, STOP and investigate.

Actual: 6/6 tests passed. Locked characterization totals unchanged: "Totals across 270 (type x sample x detector) runs: PASS=190 PARTIAL=27 EXTRA=1 FAIL=52" — identical to the pre-existing locked assertions, confirming zero drift.

- [x] **Step 6: Commit**

```bash
git commit -m "feat(engine): SequenceBuilder executes options.loopSpec via spec-executor (per-component periods + overlay)" -- packages/sequence-engine/src/generation/builder/SequenceBuilder.ts packages/sequence-engine/tests/generation/loop-spec-build.test.ts
```

---

## P2 — App: generation plumbing, lifecycle, resolver

### Task 5: `SequenceData.loopSpec` switches to wire form; resolver derives periods + mismatch flag

**Files:**
- Modify: `src/lib/shared/foundation/domain/models/sequence-data.ts` (line 24 import, line 111 field, line ~220 createSequenceData passthrough)
- Modify: `src/lib/features/loop-labeler/services/loop-display-resolver.ts` (spec branch, line ~122-144)
- Test: `tests/unit/loop/loop-display-resolver-spec.test.ts` (create)

Rationale (locked in spec): nothing writes `loopSpec` today, so changing its type from the runtime-Map `LOOPSpec` to the JSON-safe `LOOPSpecWire` is free and makes Firestore persistence automatic.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  resolveLoopDisplay,
  clearLoopDisplayCache,
} from "$lib/features/loop-labeler/services/loop-display-resolver";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";

describe("resolveLoopDisplay — wire-form loopSpec", () => {
  it("derives components + per-component periods from a wire spec", () => {
    clearLoopDisplayCache();
    const display = resolveLoopDisplay({
      id: "spec-wire-test",
      loopSpec: {
        blue: {
          rotated: { period: 2 },
          mirrored: { period: 2 },
          inverted: { period: 4, mode: "overlay" },
        },
        red: {
          rotated: { period: 2 },
          mirrored: { period: 2 },
          inverted: { period: 4, mode: "overlay" },
        },
      },
    } as any);

    expect(display.components).toContain(LOOPComponent.ROTATED);
    expect(display.components).toContain(LOOPComponent.MIRRORED);
    expect(display.components).toContain(LOOPComponent.INVERTED);
    expect(display.rotationPeriod).toBe(Period.HALVED);
    expect(display.inversionPeriod).toBe(Period.QUARTERED);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/loop/loop-display-resolver-spec.test.ts --config tests/config/vitest.config.ts`
Expected: FAIL — spec branch iterates `prop.components` as a Map; wire Record has no entries iterator; rotationPeriod/inversionPeriod not derived.

Actual: FAILED for the right reason — `TypeError: prop.components is not iterable` at `loop-display-resolver.ts:130` (the Map-iteration line), thrown from inside `resolveLoopDisplay`.

- [x] **Step 3: Implement**

`sequence-data.ts`: change import to `import type { LOOPSpecWire } from "@tka/sequence-engine/loop";` and field to `readonly loopSpec?: LOOPSpecWire;`. In `createSequenceData`, add passthrough next to componentDomains (line ~220): `...(data.loopSpec !== undefined && { loopSpec: data.loopSpec }),`.

`loop-display-resolver.ts` spec branch — replace the Map iteration with wire-Record iteration and derive periods:

```ts
  if (input.loopSpec) {
    const components = new Set<LOOPComponent>();
    const componentDomains = new Map<LOOPComponent, LOOPDomain>();
    let maxPeriod = 1;
    let rotationInterval: number | undefined;
    let inversionInterval: number | undefined;

    for (const prop of [input.loopSpec.blue, input.loopSpec.red]) {
      if (!prop) continue;
      for (const [compKey, cSpec] of Object.entries(prop)) {
        const comp = compKey as LOOPComponent;
        if (RESERVED_ORIENTATION_PRIMITIVES.has(comp)) continue;
        components.add(comp);
        if (cSpec.domain) componentDomains.set(comp, cSpec.domain);
        else if (cSpec.mode === "overlay") componentDomains.set(comp, "orientation");
        maxPeriod = Math.max(maxPeriod, cSpec.period);
        if (comp === LOOPComponent.ROTATED) rotationInterval = cSpec.period;
        if (comp === LOOPComponent.INVERTED) inversionInterval = cSpec.period;
      }
    }

    return {
      components,
      period: maxPeriod,
      componentDomains: Object.fromEntries(componentDomains) as Partial<Record<LOOPComponent, LOOPDomain>>,
      rotationPeriod: rotationInterval === 4 ? Period.QUARTERED : rotationInterval === 2 ? Period.HALVED : undefined,
      inversionPeriod: inversionInterval === 4 ? Period.QUARTERED : inversionInterval === 2 ? Period.HALVED : undefined,
    };
  }
```

Mismatch flag (same file): after the spec branch computes `components`, when the input also has enough steps, run detection in a `try` and compare sets; on difference call a module-level hook:

```ts
export type LoopDisplayMismatch = { sequenceId: string | null; specComponents: string[]; detectedComponents: string[] };
let mismatchHandler: ((m: LoopDisplayMismatch) => void) | null = null;
export function onLoopDisplayMismatch(handler: (m: LoopDisplayMismatch) => void) { mismatchHandler = handler; }
```

Fire it (and a `console.debug` in dev) but ALWAYS return the spec-derived display — spec wins, disagreement is telemetry (D3). Guard the detection call so a detection throw never breaks display.

**Deviation (scope, mechanical):** `src/lib/shared/loop-labeler/get-loop-display-resolver.ts` is a second, independent declaration of `LoopDisplayInput`/`ResolveLoopDisplayFn` (kept separate from `loop-display-resolver.ts` deliberately, to avoid a shared→features reverse import at the DI registration seam — `registerLoopDisplayResolver(resolveLoopDisplay)` is called from `composition-root/index.ts`, `cover-front-renderer.ts`, and `QScanPage.svelte`). It imported the same runtime-Map `LOOPSpec` for its own copy of `LoopDisplayInput`. Left unchanged, `resolveLoopDisplay`'s new parameter type (`loopSpec?: LOOPSpecWire`, inherited from `SequenceData`) would no longer satisfy `ResolveLoopDisplayFn`'s parameter type (`loopSpec?: LOOPSpec`), breaking `registerLoopDisplayResolver(resolveLoopDisplay)` at the type level everywhere it's called. This is the "something else references the old runtime-Map typing" case flagged by the executor's discipline checklist — not a behavioral conflict (grep confirmed no file actually iterates `.components` as a Map through this seam, per the `no matches` greps for `loopSpec|LoopDisplayInput` in every file that calls `registerLoopDisplayResolver`/`tryGetLoopDisplayResolver`), just a duplicate type declaration that must track the same rename. Fixed by swapping `LOOPSpec` → `LOOPSpecWire` in that file's import and `LoopDisplayInput` alias (2-line change, no logic difference).

- [x] **Step 4: Run tests**

Run: `npx vitest run tests/unit/loop/loop-display-resolver-spec.test.ts tests/unit/loop/nested-rotation-detection.test.ts --config tests/config/vitest.config.ts`
Expected: both PASS (nested-rotation regression must stay green — it exercises the detection path with no spec present).

Actual: both PASS (3 tests: 1 new + 2 nested-rotation). Full `tests/unit/loop` suite re-run afterward: 16 files / 80 tests passed, including `real-loop-detector-audit.test.ts`'s locked characterization totals unchanged (`PASS=190 PARTIAL=27 EXTRA=1 FAIL=52`) — zero drift.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(loop): SequenceData.loopSpec in wire form; resolver derives per-component periods + mismatch hook" -- src/lib/shared/foundation/domain/models/sequence-data.ts src/lib/features/loop-labeler/services/loop-display-resolver.ts tests/unit/loop/loop-display-resolver-spec.test.ts
```

---

### Task 6: `buildLoopSpec` in loop-type-utils

**Files:**
- Modify: `src/lib/shared/create/services/loop-type-utils.ts`
- Test: `tests/unit/services/loop-type-utils.test.ts` (extend — file exists with 8 tests)

- [x] **Step 1: Write failing tests** (append to existing describe block)

```ts
import { buildLoopSpec, expanderMultiplier } from "$lib/shared/create/services/loop-type-utils";

describe("buildLoopSpec", () => {
  it("defaults reproduce today's behavior: rotation at the chosen interval, all other components at interval 2, expand mode", () => {
    const wire = buildLoopSpec(new Set([LOOPComponent.ROTATED, LOOPComponent.MIRRORED, LOOPComponent.INVERTED]), { rotationInterval: 4 });
    expect(wire).not.toBeNull();
    expect(wire!.blue!.rotated).toEqual({ period: 4 });
    expect(wire!.blue!.mirrored).toEqual({ period: 2 });
    expect(wire!.blue!.inverted).toEqual({ period: 2 });
    expect(wire!.red).toEqual(wire!.blue);
  });

  it("carries inversion rhythm + overlay mode", () => {
    const wire = buildLoopSpec(new Set([LOOPComponent.MIRRORED, LOOPComponent.INVERTED]), {
      inversionInterval: 4,
      inversionMode: "overlay",
    });
    expect(wire!.blue!.inverted).toEqual({ period: 4, mode: "overlay" });
  });

  it("returns null for unmapped combos (same gate as generateLOOPType)", () => {
    const wire = buildLoopSpec(new Set([LOOPComponent.MIRRORED, LOOPComponent.FLIPPED, LOOPComponent.REWOUND]), {});
    expect(wire).toBeNull();
  });

  it("expanderMultiplier: overlay does not multiply", () => {
    const wire = buildLoopSpec(new Set([LOOPComponent.ROTATED, LOOPComponent.MIRRORED, LOOPComponent.INVERTED]), {
      rotationInterval: 2, inversionInterval: 4, inversionMode: "overlay",
    })!;
    expect(expanderMultiplier(wire)).toBe(4); // rot x2 * mir x2; overlay inversion contributes x1
  });

  it("expanderMultiplier: rotation absorbed when it shares a period with swap/invert only (engine fuseableAtSamePeriod rule)", () => {
    // ROTATED_INVERTED, both at period 2: the engine's FusedExecutor absorbs
    // the rotation into the single fused stage (spec-executor.ts), so the
    // total multiplier is 2, NOT 4. (Task 4 discovered this — the naive
    // product-of-periods formula double-counts.)
    const wire = buildLoopSpec(new Set([LOOPComponent.ROTATED, LOOPComponent.INVERTED]), {
      rotationInterval: 2,
    })!;
    expect(expanderMultiplier(wire)).toBe(2);
  });

  it("expanderMultiplier: rotation stays a separate stage when mirror/flip shares its period", () => {
    // rot:2 + mir:2 + inv:2 (today's halved MIR): rotate stage x2, fused group x2 = 4.
    const wire = buildLoopSpec(new Set([LOOPComponent.ROTATED, LOOPComponent.MIRRORED, LOOPComponent.INVERTED]), {
      rotationInterval: 2,
    })!;
    expect(expanderMultiplier(wire)).toBe(4);
    // rot:2 + mir:2 + inv:4 (full triple, independent inversion): x2 * x2 * x4 = 16.
    const triple = buildLoopSpec(new Set([LOOPComponent.ROTATED, LOOPComponent.MIRRORED, LOOPComponent.INVERTED]), {
      rotationInterval: 2, inversionInterval: 4,
    })!;
    expect(expanderMultiplier(triple)).toBe(16);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/services/loop-type-utils.test.ts --config tests/config/vitest.config.ts`
Expected: FAIL — exports missing.

Actual: FAILED for the right reason — `TypeError: buildLoopSpec is not a function` on all 6 new tests; the pre-existing 8 tests still passed (8 passed / 6 failed).

- [x] **Step 3: Implement** (in `loop-type-utils.ts`)

```ts
import type { LOOPSpecWire, PropLOOPSpecWire } from "@tka/sequence-engine/loop";

export interface LoopRhythm {
  rotationInterval?: 2 | 4;   // default 2
  inversionInterval?: 2 | 4;  // default 2
  inversionMode?: "expand" | "overlay"; // default "expand"
}

/**
 * Build a symmetric wire-form LOOPSpec from the UI component set + rhythm.
 * Returns null for combos with no implemented mapping (same gate as
 * generateLOOPType — the combo overlay's gating stays the single source
 * of truth for which component SETS are allowed).
 */
export function buildLoopSpec(
  components: Set<LOOPComponent>,
  rhythm: LoopRhythm,
): LOOPSpecWire | null {
  if (generateLOOPType(components) === null && components.size > 0) return null;
  if (components.size === 0) return null;

  const prop: PropLOOPSpecWire = {};
  for (const comp of components) {
    if (comp === LOOPComponent.ROTATED) {
      prop.rotated = { period: rhythm.rotationInterval ?? 2 };
    } else if (comp === LOOPComponent.INVERTED) {
      prop.inverted = {
        period: rhythm.inversionInterval ?? 2,
        ...(rhythm.inversionMode === "overlay" ? { mode: "overlay" as const } : {}),
      };
    } else {
      prop[comp] = { period: 2 };
    }
  }
  return { blue: prop, red: prop };
}

/**
 * Total length multiplier of the spec's EXPANDER stages (overlay contributes
 * x1). Seed length = total / this.
 *
 * Mirrors the engine's stage semantics in spec-executor.ts exactly — the
 * naive product-of-periods formula is WRONG (Task 4 finding):
 *  - Fuseable expanders (mirrored/flipped/swapped/inverted) grouped by
 *    period run as ONE FusedExecutor stage per period group (x period once
 *    per group, not per component).
 *  - ROTATED runs as a separate stage ONLY when no fuseable group shares
 *    its period, OR a mirror/flip shares its period. When only swap/invert
 *    share rotation's period, FusedExecutor absorbs the rotation
 *    (fuseableAtSamePeriod branch) — rotation contributes x1.
 */
export function expanderMultiplier(wire: LOOPSpecWire): number {
  const prop = wire.blue ?? wire.red;
  if (!prop) return 1;

  const FUSEABLE = ["mirrored", "flipped", "swapped", "inverted"] as const;
  const groups = new Map<number, { hasMirrorOrFlip: boolean }>();
  for (const comp of FUSEABLE) {
    const cSpec = prop[comp];
    if (!cSpec || cSpec.mode === "overlay") continue;
    const group = groups.get(cSpec.period) ?? { hasMirrorOrFlip: false };
    if (comp === "mirrored" || comp === "flipped") group.hasMirrorOrFlip = true;
    groups.set(cSpec.period, group);
  }

  let mult = 1;
  const rot = prop.rotated;
  if (rot && rot.mode !== "overlay") {
    const sharing = groups.get(rot.period);
    if (!sharing || sharing.hasMirrorOrFlip) mult *= rot.period;
    // else: rotation absorbed into the fused stage — x1
  }
  for (const period of groups.keys()) mult *= period;
  if (prop.rewound) mult *= prop.rewound.period;
  return mult;
}
```

- [x] **Step 4: Run tests** — expect all loop-type-utils tests PASS (old 8 + new 6).

Actual: 14/14 tests passed.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(create): buildLoopSpec + expanderMultiplier — UI component set + rhythm to wire spec" -- src/lib/shared/create/services/loop-type-utils.ts tests/unit/services/loop-type-utils.test.ts
```

---

### Task 7: Generation options + orchestrator seed solver + spec pass-through

**Files:**
- Modify: `src/lib/shared/create/utils/config-mapper.ts` (`uiConfigToGenerationOptions`, ~lines 92-135)
- Modify: `src/lib/shared/create/services/generation-orchestrator.ts` (`generateCircularSequence`, lines 114-157)
- Modify: the `GenerationOptions` type (declared where config-mapper imports it — follow the import)
- Test: `tests/unit/services/generation-orchestrator-loopspec.test.ts` (create; mock the builder)

- [x] **Step 1: Write the failing test** — assert three behaviors without running a real build (inject a stub `SequenceBuilder` or spy on `build`):

```ts
// 1. Seed solver: options.length 16 + spec {rot:2, mir:2, inv overlay:4}
//    -> builder.build called with length 4 (16 / expanderMultiplier(4)).
// 2. loopSpec passed to builder options as the RUNTIME form (loopSpecFromWire).
// 3. Non-divisible length (e.g. 18 with multiplier 4) -> typed error
//    (orchestrator throws Error with message matching /divisible/),
//    and degenerate guard: computed seed length 1 with an inversion
//    component whose mode is "expand" -> error matching /too short/.
```

Write it against the orchestrator's public `generateSequence(options)` with `loopSpecWire` set on options. Follow the existing test-mocking conventions in `tests/unit/services/` (look at neighboring orchestrator/service tests for the DI pattern; `GenerationOrchestrator` takes its variation provider via constructor — construct it directly with a stub provider and stub the `SequenceBuilder` module via `vi.mock("@tka/sequence-engine/generation")`).

Actual test file: `tests/unit/services/generation-orchestrator-loopspec.test.ts` — 4 tests: seed-length solve + `loop.loopSpec` pass-through, `/divisible/` throw, `/too short/` throw, and a legacy-path (no `loopSpecWire`) control asserting byte-identical division + no `loop.loopSpec` key.

**Deviation (mechanical):** the mocked `SequenceBuilder` must be a `class`/`function`, not `vi.fn().mockImplementation(() => ({...}))` — the orchestrator calls it with `new SequenceBuilder(...)`, and a `mockImplementation` arrow function is not a valid constructor (`TypeError: ... is not a constructor`). Fixed by mocking a real `class SequenceBuilder { build(...args) { return buildMock(...args); } }` inside the `vi.mock` factory.

- [x] **Step 2: Run to verify failure.**

Run: `npx vitest run tests/unit/services/generation-orchestrator-loopspec.test.ts --config tests/config/vitest.config.ts`
Expected: FAIL — `loopSpecWire`/`loopRhythm` not yet on `GenerationOptions`, orchestrator ignores `options.loopSpecWire` entirely.

Actual: FAILED for the right reason once the constructor-mock issue above was fixed — the "solves seed length" test got `callArg.length === 8` (legacy `period`-based halved divide) instead of `4` (expanderMultiplier-based); the `/divisible/` and `/too short/` tests resolved instead of rejecting (no guards existed yet). The legacy-path control test passed immediately (nothing to change there), confirming it as a true regression control rather than a tautology.

- [x] **Step 3: Implement**

`GenerationOptions` gains `loopSpecWire?: LOOPSpecWire;` and `loopRhythm?: LoopRhythm;` (rhythm kept for provenance/UI echo). `uiConfigToGenerationOptions`: build it —

```ts
const loopSpecWire = uiConfig.loopEnabled && uiConfig.loopType
  ? buildLoopSpec(componentsFromConfig(uiConfig), {
      rotationInterval: uiConfig.period === Period.QUARTERED ? 4 : 2,
      inversionInterval: uiConfig.inversionInterval ?? 2,
      inversionMode: uiConfig.inversionMode ?? "expand",
    }) ?? undefined
  : undefined;
```

(`componentsFromConfig` = parse `uiConfig.loopType` through the existing `parseLoopComponents`/`IMPLEMENTED_COMBOS` reverse mapping in loop-type-utils — add a small exported helper `componentsForLoopType(loopType): Set<LOOPComponent> | null` next to `IMPLEMENTED_COMBOS`.) `UIGenerationConfig` gains optional `inversionInterval?: 2 | 4` and `inversionMode?: "expand" | "overlay"` (P3 UI will set them; absent = today's behavior).

**Deviation:** no new `componentsForLoopType` helper was added. `parseLoopComponents(loopType)` (already in `loop-type-utils.ts`, grepped per the executor brief's instruction to check first) IS `componentsForLoopType` — same signature shape (`LOOPType | string | null | undefined -> Set<LOOPComponent>`), same substring-parsing semantics against the same 6 primitives. Adding a second reverse-mapping function next to it would have been a duplicate, forbidden by `never-hand-roll.md`. `uiConfigToGenerationOptions` calls `parseLoopComponents(uiConfig.loopType)` directly as `componentsFromConfig`.

`generation-orchestrator.ts` `generateCircularSequence`:

```ts
const multiplier = options.loopSpecWire
  ? expanderMultiplier(options.loopSpecWire)
  : (period === EnginePeriod.QUARTERED ? 4 : 2);
if (options.loopSpecWire && options.length % multiplier !== 0) {
  throw new Error(`A ${options.length}-beat sequence is not divisible by this combo's expansion (${multiplier}).`);
}
const seedLength = Math.max(1, Math.floor(options.length / multiplier));
const wire = options.loopSpecWire;
const hasExpandInversion = !!wire && Object.values(wire.blue ?? {}).some((c, i) =>
  Object.keys(wire.blue ?? {})[i] === "inverted" && c.mode !== "overlay");
if (wire && hasExpandInversion && seedLength < 2) {
  throw new Error("Seed too short for an inversion combo — one-beat half seeds are dash-only, so inversion would be invisible.");
}
// builder.build({ ..., loop: {...existing...}, ...(wire ? { loopSpec: loopSpecFromWire(wire) } : {}) })
```

(Clean up that `hasExpandInversion` expression to a readable helper — `specHasExpandInversion(wire)` in loop-type-utils, one Object.entries loop.)

Implemented `specHasExpandInversion(wire)` as `!!wire.blue?.inverted && wire.blue.inverted.mode !== "overlay"` (falls back to `wire.red`) rather than the plan's `Object.values(...).some((c, i) => Object.keys(...)[i] === "inverted" ...)` sketch — reads directly off the `inverted` key instead of index-matching parallel `Object.values`/`Object.keys` arrays (fragile if key order ever changed), same semantics.

`GenerationOptions` (`generate-models.ts`) gained `loopSpecWire?: LOOPSpecWire` and `loopRhythm?: LoopRhythm` (the latter via `import type { LoopRhythm } from "$lib/shared/create/services/loop-type-utils"` — type-only, erased at compile time, so it does not create a runtime cycle with `loop-type-utils.ts`'s existing `import { LOOPComponent } from "...generate-models"`).

- [x] **Step 4: Run tests** — new orchestrator test + `npx vitest run tests/unit/services --config tests/config/vitest.config.ts` green.

Actual: `generation-orchestrator-loopspec.test.ts` 4/4 passed. Full `tests/unit/services` suite: **10 files / 85 tests passed** (0 failed). Pre-existing unrelated stderr noise in `DeviceIdService.test.ts` (Firestore mock warning) and `SequenceHydrator.test.ts` (jsdom has no IndexedDB, CSV fetch fails in node) — both tests still pass; this is pre-existing test-environment noise, not a regression from this task.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(create): generation solves seed length from expander multiplier and passes loopSpec to the builder" -- src/lib/shared/create/utils/config-mapper.ts src/lib/shared/create/services/generation-orchestrator.ts src/lib/shared/create/services/loop-type-utils.ts src/lib/shared/foundation/domain/models/generation/generate-models.ts tests/unit/services/generation-orchestrator-loopspec.test.ts tests/unit/services/loop-type-utils.test.ts
```

---

### Task 8: BuildResultTransformer writes the spec certificate

**Files:**
- Modify: `src/lib/shared/create/services/build-result-transformer.ts` (`convertToSequenceData`, lines ~59-128)
- Test: `tests/unit/services/build-result-transformer-loopspec.test.ts` (create; the transformer is pure — no mocking needed)

- [x] **Step 1: Failing test** — `convertToSequenceData(result, options)` with `options.loopSpecWire` set returns SequenceData with `loopSpec` === that wire object AND the derived legacy `loopType` still set; without `loopSpecWire`, `loopSpec` is absent (legacy behavior byte-identical).

Actual test file: `tests/unit/services/build-result-transformer-loopspec.test.ts` — 3 tests, constructed directly against the real `sequenceMetadataManager`/`reversalDetector` singletons (no mocking, per the transformer being pure) with a hand-built minimal `BuildResult` (2-step engine sequence) and `GenerationOptions`: (1) circular result + `loopSpecWire` set → `loopSpec` === the wire object, `loopType` still set; (2) circular result, no `loopSpecWire` → `loopSpec` absent, `loopType` still set (legacy control); (3) non-circular result + `loopSpecWire` set → `loopSpec` still absent (proves the `isCircular` gate, not just presence of the option).

- [x] **Step 2: Verify failure.**

Run: `npx vitest run tests/unit/services/build-result-transformer-loopspec.test.ts --config tests/config/vitest.config.ts`

Actual: FAILED for the right reason — test 1 (`writes SequenceData.loopSpec...`) got `expected undefined to be { blue: {...}, red: {...} }` (certificate not yet written); tests 2 and 3 passed trivially (they assert absence, already true pre-implementation) — confirming they're true regression controls, not tautologies.

- [x] **Step 3: Implement** — in the `createSequenceData({...})` call add:

```ts
...(isCircular && options.loopSpecWire ? { loopSpec: options.loopSpecWire } : {}),
```

Implemented exactly as planned, no deviation.

- [x] **Step 4: Tests green.**

Actual: `build-result-transformer-loopspec.test.ts` 3/3 passed. Full `tests/unit/services` suite: **11 files / 88 tests passed** (0 failed) — up from the Task 7 baseline of 10 files/85 tests by exactly this task's 1 file/3 tests. Same pre-existing env-noise stderr in `SequenceHydrator.test.ts`/`DeviceIdService.test.ts` as noted in Task 7 — not a regression.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(create): generated sequences carry their loopSpec certificate" -- src/lib/shared/create/services/build-result-transformer.ts tests/unit/services/build-result-transformer-loopspec.test.ts
```

---

### Task 9: Clear-on-edit (spec invalidation)

**Files:**
- Modify: `src/lib/features/create/shared/state/operations/sequence-step-operations.ts` (all beat mutations: `addStep`, `removeStep`, `removeStepWithAnimation`, `removeStepAndSubsequent(WithAnimation)`, `updateStep`, `insertStep`)
- Modify: `src/lib/features/create/shared/services/step-operator.ts` (turns/orientation/duration path, `setCurrentSequence` call ~line 212)
- Create: `src/lib/shared/create/services/loop-certificate.ts` (single helper)
- Test: `tests/unit/services/loop-certificate.test.ts`

Do NOT hook `sequence-core-state.setCurrentSequence` itself — it also receives loads and generation results, which must KEEP their spec. Only mutations clear it.

- [x] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { withLoopCertificateCleared } from "$lib/shared/create/services/loop-certificate";

describe("withLoopCertificateCleared", () => {
  it("strips loopSpec on a mutated sequence", () => {
    const seq: any = { id: "x", steps: [], loopSpec: { blue: { rotated: { period: 2 } } }, loopType: "rotated" };
    const out = withLoopCertificateCleared(seq);
    expect(out.loopSpec).toBeUndefined();
    expect(out.loopType).toBe("rotated"); // legacy display string survives; only the certificate dies
    expect(out).not.toBe(seq);
  });

  it("is a no-op passthrough when no certificate present", () => {
    const seq: any = { id: "x", steps: [] };
    expect(withLoopCertificateCleared(seq)).toBe(seq);
  });
});
```

- [x] **Step 2: Verify failure.**

Run: `npx vitest run tests/unit/services/loop-certificate.test.ts --config tests/config/vitest.config.ts`

Actual: FAILED for the right reason — `Error: Failed to resolve import "$lib/shared/create/services/loop-certificate"` (module doesn't exist yet).

- [x] **Step 3: Implement**

`loop-certificate.ts`:

```ts
/**
 * Spec lifecycle (2026-07-12 compositional-loop spec, D4): the stored
 * loopSpec is a proof certificate written by generation. Any beat-level
 * mutation invalidates it — detection takes over for display. The legacy
 * loopType string is kept (it is display provenance, not a certificate).
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

export function withLoopCertificateCleared(sequence: SequenceData): SequenceData {
  if (sequence.loopSpec === undefined) return sequence;
  const { loopSpec: _dropped, ...rest } = sequence;
  return rest as SequenceData;
}
```

In `sequence-step-operations.ts`: wrap every `coreState.setCurrentSequence(updatedSequence)` in the mutation methods as `coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence))`. In `step-operator.ts` line ~212 same wrap. Also clear the display cache for the sequence id after mutation (`clearLoopDisplayCache` — check its signature; if it clears globally, call it as-is) so a card doesn't keep rendering the dead certificate.

**Deviation (file location, factual correction):** `step-operator.ts` itself has NO direct `setCurrentSequence` call — it is a thin facade class (`StepOperator`) that delegates every method to a handler file under `src/lib/features/create/shared/services/step-operations/`. Grepping `setCurrentSequence` across that directory found the turns/orientation/duration call sites at `turns-handler.ts:212` (the plan's stated line number — it belonged to this file, not `step-operator.ts`), `orientation-handler.ts:165`, and `duration-handler.ts:91`. All three were wrapped instead of a nonexistent line in `step-operator.ts`. The other handler files in that directory (`rotation-direction-handler.ts`, `prop-type-handler.ts`, `beta-swap-handler.ts`, `path-shape-handler.ts`, `batch-edit-handler.ts`, `arrow-adjustment-handler.ts`, `step-removal-handler.ts`) also call `setCurrentSequence` but are outside this task's literal scope ("turns/orientation/duration path" only) — left un-wrapped and flagged here as a known gap for a future task, not silently expanded into.

**Deviation (scope, additive):** `clearSequence()` in `sequence-step-operations.ts` was also wrapped even though the plan's file-header parenthetical list (`addStep, removeStep, removeStepWithAnimation, removeStepAndSubsequent(WithAnimation), updateStep, insertStep`) doesn't name it. It calls `coreState.setCurrentSequence` in the same file at the same chokepoint, and clearing all beats to `[]` makes any stored `loopSpec` (period/components describing a now-nonexistent sequence) immediately nonsensical — leaving it un-wrapped would have been a known bug adjacent to the one this task fixes, in the exact file already being edited.

**Deviation (cache-clear mechanism — the flagged layering question):** Traced `resolveLoopDisplay`'s cache: `cacheKey = getSequenceId(input) = input.id` (`loop-display-resolver.ts:93-95`), and the id does NOT change across a beat mutation (same sequence, edited in place) — so the plan's escape hatch ("if the cache key includes something that changes on edit, document that no clear is needed and skip it") does NOT apply here; a stale cache entry would genuinely outlive the certificate strip. Confirmed a live consumer: `ChoreoCard.svelte:427-430` calls `tryGetLoopDisplayResolver()` reactively (`$derived.by`) keyed off the same `sequence` object shown while editing, so a stale cache entry would keep a card rendering the dead certificate's components/period exactly as the task worried. A direct import of `clearLoopDisplayCache` from `features/loop-labeler/services/loop-display-resolver.ts` into the create module would violate the create→features/loop-labeler layering boundary the codebase already avoids via the DI seam at `src/lib/shared/loop-labeler/get-loop-display-resolver.ts` (which registers `resolveLoopDisplay` from `composition-root/index.ts` for the same reason). Extended that existing seam with a parallel pair — `registerLoopDisplayCacheClearer` / `tryGetLoopDisplayCacheClearer` — rather than adding a new import path or duplicating the resolver-registration pattern. `composition-root/index.ts` now also registers `clearLoopDisplayCache` alongside `resolveLoopDisplay`. `loop-certificate.ts` gained a second export, `invalidateLoopDisplayCache()`, which calls `tryGetLoopDisplayCacheClearer()?.()` (a no-op before bootstrap, e.g. in unit tests) — kept separate from the pure, unit-tested `withLoopCertificateCleared` so that function's tested contract (pure strip, `toBe(seq)` no-op passthrough) stays exactly as specified with no side effect folded in. Every wrapped call site invokes both: `coreState.setCurrentSequence(withLoopCertificateCleared(updatedSequence)); invalidateLoopDisplayCache();`.

- [x] **Step 4: Run tests** — new test green + `npx vitest run tests/unit/loop --config tests/config/vitest.config.ts` green.

Actual: `loop-certificate.test.ts` 2/2 passed. Full `npx vitest run tests/unit/loop tests/unit/services --config tests/config/vitest.config.ts`: **28 files / 170 tests passed** (0 failed), including `real-loop-detector-audit.test.ts`'s locked characterization totals unchanged (`PASS=190 PARTIAL=27 EXTRA=1 FAIL=52`) — zero drift.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(create): beat-level edits invalidate the loopSpec certificate" -- src/lib/shared/create/services/loop-certificate.ts src/lib/features/create/shared/state/operations/sequence-step-operations.ts src/lib/features/create/shared/services/step-operations/turns-handler.ts src/lib/features/create/shared/services/step-operations/orientation-handler.ts src/lib/features/create/shared/services/step-operations/duration-handler.ts src/lib/shared/loop-labeler/get-loop-display-resolver.ts src/lib/shared/composition-root/index.ts tests/unit/services/loop-certificate.test.ts
```

---

### Task 10: Full gates

- [x] **Step 1:** `cd packages/sequence-engine && npx vitest run` — engine suite green.
  Actual: **36 test files / 282 tests passed** (0 failed). The "CONFIRMED failures" block in the console output is the fixture-audit test's own printed characterization report, not a vitest failure — the final summary line is all green.
- [x] **Step 2:** `npx vitest run tests/unit/loop tests/unit/services --config tests/config/vitest.config.ts` — app loop + services suites green.
  Actual: **28 test files / 170 tests passed** (0 failed), including `real-loop-detector-audit.test.ts`'s locked characterization totals unchanged (`PASS=190 PARTIAL=27 EXTRA=1 FAIL=52`).
- [x] **Step 3:** ONE full `npm run check > check.log 2>&1; grep -niE "error" check.log`.
  Actual: **1 pre-existing, unrelated error** — `svelte-check found 1 error and 0 warnings in 1 file`, in `src/lib/features/learn/play/components/previews/OptionPulsePreview.svelte:31:45` ("Object is possibly 'undefined'."). Confirmed via `git status --short` and `git log` that this file is untouched by this session's work (P1/P2 loop-certificate changes) and last modified in prior commit `ef8eb6d0f6`. Not introduced by, and not blocking, this plan's scope — flagging as a known pre-existing gap rather than silently claiming 0 errors.
- [x] **Step 4:** Re-run fixture audit once more: `npx vitest run tests/unit/loop/real-loop-detector-audit.test.ts --config tests/config/vitest.config.ts` — identical results (zero drift).
  Actual: `Totals across 270 (type x sample x detector) runs: PASS=190 PARTIAL=27 EXTRA=1 FAIL=52` — identical to Step 2's embedded run. 1 test file / 6 tests passed.
- [x] **Step 5:** No commit (gates only). Report results.
  Actual: gates run and reported; this plan-file update is committed separately from any code change per `commit-only-your-own-changes.md`.

---

## Deferred to P3/P4 (explicitly NOT in this plan)

- Rhythm UI in `LOOPExpandedOverlay` (interval controls, word-math line, block timeline) — P3.
- `LOOPIconStrip` nesting order + overlay dot — P3.
- Detection completeness (canonical peel + overlay check in labeler/engine), fixtures from the variant script, mismatch review queue — P4.
- MCP tool spec params + engine redeploy — post-P2.
