# Halved Pictograph Pipeline — Phase 2: Half-Motion Arrow Identity + Assets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a half-motion its positioned arrow. Add a `segment` discriminator to `MotionData` and additive "half" branches to the real arrow positioning pipeline (location, rotation, asset path), so the system places an end-direction half-glyph on a pictograph through the same pipeline that places every other arrow — zero change to any existing arrow.

**Architecture:** A segment motion is an ordinary `MotionData` whose end state IS the halfway state (`endLocation`/`endOrientation` already carry the halfway values, computed once upstream by Phase 1's `calculateOrientationAt`), plus a `segment: {t0,t1}` marker. The pipeline branches on `segment` presence in exactly three pure places — location returns the halfway `GridLocation`; rotation is the halfway staff angle derived from Phase 1's **pure** `orientationToStaffAngle` bijection (no animation-engine import into the arrow pipeline, so no dependency cycle); the asset resolver loads a `_half` SVG. The letter-based adjustment machinery is bypassed for segment frames (empty letter + a `{0,0}` orchestrator guard); authored pixel nudges are Phase 2b. The four seed glyphs already exist, hand-drawn and on-page, in `lifted-turn-arrows.ts`; extraction isolates each glyph subpath into a normalized `_half` asset.

**Tech Stack:** TypeScript, Svelte 5 repo, Vitest (node env), `$lib` path alias. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-14-halved-pictograph-pipeline-design.md` (§6). Depends on Phase 1 (shipped): `orientation-angle.ts` (`orientationToStaffAngle`, `RADIAL_CYCLE`), `orientation-at.ts` (`calculateOrientationAt`).

---

## Findings that refine the spec (from two file:line-verified pipeline maps, 2026-07-14)

These four discoveries reshape §6 and are load-bearing for the tasks below:

1. **Half-glyphs are turn-invariant.** The curl / zig-zag / bow / loop is ONE shape per motion type; turns change the *rotation*, not the glyph (this is why the reference generator `pose-arrow.ts` carries exactly four glyphs across all `t`). The spec's feared "author a per-turn family" collapses to **four base assets** (+ optional radial/nonradial or skew variants only if a scenario proves it needs one). This is the single biggest de-risking.
2. **Rotation is derivable from Phase 1 — do not hand-author rotation maps.** The spec §6 said "authored maps (not a formula)." That predates the keystone. `orientationToStaffAngle(halfwayOrientation, centerPathAngle)` gives the exact physical staff angle; hand-authoring a location×turns rotation table would *duplicate the keystone* and risk drift (`never-hand-roll`). We derive it. Only the pixel *nudge* stays authored (Phase 2b).
3. **`id="centerPoint"` is OPTIONAL, not required.** Spec §6 says required — wrong. `parseArrowSvg` (`arrow-svg-parser.ts:40`) defaults the pivot to viewBox center and only overrides if a `#centerPoint` exists. Real arrow assets have none (bare `<svg viewBox><path style="fill:#2e3192"/></svg>`). A `_half` asset must match that bare shape, blue `#2e3192` fill (runtime-recolored). Note the parser's `viewBox < 50×50 → rescale to 250` branch (`:29`) — keep half viewBoxes ≥ 50 unless a dash-bow deliberately uses it.
4. **A second closed list + a footgun.** `ArrowPlacer.filesFor` hardcodes `motionTypes = ["pro","anti","float","dash","static"]` (`arrow-placer.ts:54`) — a separate closed list from `MotionType`. And `arrow-positioning-orchestrator.ts:58` defaults `letter` to `"A"` when falsy, which would route a letterless half-frame into letter-A's Special/Global adjustment tiers. Phase 2a routes *around* both (empty letter + `{0,0}` guard, no loader change); Phase 2b adds a sibling `_half` loader bucket rather than mutating the hardcoded array.

**Codebase contradiction to be aware of (not fixed here):** two glyph sources carry opposite "canonical" headers — `lifted-turn-arrows.ts` (real hand-drawn, rendered on-page: **use this**) and dead `pose-arrow.ts` (standard 1.0 arrows mislabeled canonical, imported by nothing). Extraction (Task 6) sources from `lifted-turn-arrows.ts`.

---

## Scope

**Phase 2a (this plan's TDD tasks 1–8):** the pure pipeline plumbing + the four extracted seed glyphs, proven by unit + integration tests that assert on-grid position and correct rotation for the seven half-motions the guide's first consumer needs. No Austen dependency; fully verifiable now.

**Phase 2b (§ at the end — post-2a, visual, requires Austen's eye):** authored `_half` default-tier pixel nudges, glyph-normalization refinement, and screenshot validation against the artboards. Not TDD; gated on a visual pass. Kept out of 2a so every 2a step is provable in isolation.

**Out of scope (Phase 3):** `buildHalvedStep`, the `showArrow` prop thread, the guide rewire. Phase 2 delivers the positioned arrow; Phase 3 composes it onto a real pictograph. Phase 2's tests construct segment motions by hand (setting `endLocation`/`endOrientation`/`segment` directly), exactly as `buildHalvedStep` will in Phase 3.

**The seven target half-motions** (all RED, staff, diamond — from the guide's turn pages; the first consumer):

| # | motionType | start→end loc | start→halfway ori | turns | t | halfway loc |
|---|---|---|---|---|---|---|
| 1 | PRO | E→S | in→? | 1 | 0.5 | SE |
| 2 | ANTI | E→S | in→? | 1 | 0.5 | SE |
| 3 | PRO | E→S | in→? | 2 | 0.5 | SE |
| 4 | ANTI | E→S | in→? | 2 | 0.5 | SE |
| 5 | ANTI | E→S | in→? | 2 | 0.5 | SE |
| 6 | DASH | S→N | in→? | 2 | 0.5 | C |
| 7 | STATIC | E→E | in→? | 2 | 0.5 | E |

(`?` halfway orientation = `calculateOrientationAt(fullMotion, 0.5)`; the tests compute it, never hardcode it.)

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/shared/pictograph/shared/domain/models/motion-data.ts` | Motion domain model | **Modify** — add `segment?` field (Task 1) |
| `src/lib/shared/pictograph/shared/domain/models/__tests__/motion-data-segment.test.ts` | Segment field/factory test | **Create** (Task 1) |
| `src/lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver.ts` | Arrow SVG path | **Modify** — `_half` variant in both resolvers (Task 2) |
| `src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-path-resolver-half.test.ts` | Path `_half` test | **Create** (Task 2) |
| `src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.ts` | Arrow location | **Modify** — segment branch above the switch (Task 3) |
| `.../calculation/services/__tests__/arrow-location-calculator-half.test.ts` | Location segment test | **Create** (Task 3) |
| `src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator.ts` | Arrow rotation | **Modify** — segment branch (pure bijection) (Task 4) |
| `.../calculation/services/__tests__/arrow-rotation-calculator-half.test.ts` | Rotation segment test | **Create** (Task 4) |
| `src/lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.ts` | Pure half-arrow rotation helper | **Create** (Task 4) |
| `src/lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.ts` | Pipeline orchestrator | **Modify** — segment letter + adjustment guards (Task 5) |
| `.../orchestration/services/__tests__/arrow-orchestrator-half.test.ts` | Orchestrator segment test | **Create** (Task 5) |
| `static/images/arrows/{pro,anti,dash,static}_half/from_radial/{mt}_half.svg` | Extracted seed glyphs | **Create** (Task 6) |
| `scripts/extract-half-glyphs.mjs` | Glyph extraction/normalization script | **Create** (Task 6) |
| `.../rendering/services/__tests__/arrow-svg-parser-half.test.ts` | Parser-accepts-`_half` test | **Create** (Task 6) |
| `.../arrow/positioning/__tests__/half-arrow-pipeline.test.ts` | 7-motion integration test | **Create** (Task 7) |
| `src/routes/test/half-arrows/+page.svelte` | Visual proof page | **Create** (Task 7) |

Boundaries: Tasks 1–5 are each a single additive branch, pure and independently testable. Task 4's rotation math lives in its own pure helper (`segment-rotation.ts`) so it can be unit-tested without the calculator class. Task 6 is asset generation (a script + four SVGs). Task 7 composes everything into one integration assertion + a visual page. Nothing existing changes behavior: every branch gates on `motion.segment`, which is absent on all current motions.

---

## Task 1: Add the `segment` discriminator to `MotionData`

`segment?: { t0: number; t1: number }` — presence means "this arrow represents a partial motion." Additive optional field; the factory needs no default (like `plane`). Do NOT expand `MotionType` (spec §6 — closed 5-value union, huge blast radius).

**Files:**
- Modify: `src/lib/shared/pictograph/shared/domain/models/motion-data.ts`
- Test: `src/lib/shared/pictograph/shared/domain/models/__tests__/motion-data-segment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/pictograph/shared/domain/models/__tests__/motion-data-segment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

describe("MotionData.segment discriminator", () => {
  it("is undefined by default (existing motions unaffected)", () => {
    const m = createMotionData({});
    expect(m.segment).toBeUndefined();
  });

  it("round-trips a segment through the factory", () => {
    const m = createMotionData({ segment: { t0: 0, t1: 0.5 } });
    expect(m.segment).toEqual({ t0: 0, t1: 0.5 });
  });

  it("carries the second-half segment too", () => {
    const m = createMotionData({ segment: { t0: 0.5, t1: 1 } });
    expect(m.segment).toEqual({ t0: 0.5, t1: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/pictograph/shared/domain/models/__tests__/motion-data-segment.test.ts`
Expected: FAIL — the factory drops `segment` (property does not exist on the interface / not copied in the factory), so the round-trip assertions fail (`undefined` !== `{t0,t1}`).

- [ ] **Step 3: Add the field and factory passthrough**

In `src/lib/shared/pictograph/shared/domain/models/motion-data.ts`, add the field inside the `MotionData` interface immediately after `pathShape?` (line 67, before the closing `}`):

```ts
  // Per-step path shape override for animation interpolation.
  // Absent/undefined = use global pathShape setting.
  readonly pathShape?: "arc" | "linear" | "concave";

  // Presence marks this motion as a PARTIAL (half/quarter) segment of a full
  // motion — its end state (endLocation/endOrientation) IS the state at fraction
  // t1. Drives the half-arrow pipeline branches (asset, location, rotation).
  // { t0: 0, t1: 0.5 } = first half; { t0: 0.5, t1: 1 } = second half. Absent on
  // every full-motion arrow, so all existing behavior is unchanged.
  readonly segment?: { t0: number; t1: number };
```

Then in `createMotionData` (after the `pathShape` line, line 124, before the closing `};`):

```ts
    plane: data.plane ?? undefined,
    pathShape: data.pathShape ?? undefined,
    segment: data.segment ?? undefined,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/pictograph/shared/domain/models/__tests__/motion-data-segment.test.ts`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/pictograph/shared/domain/models/motion-data.ts src/lib/shared/pictograph/shared/domain/models/__tests__/motion-data-segment.test.ts
git commit -m "feat(motion): add segment discriminator to MotionData for half-motion arrows" -- src/lib/shared/pictograph/shared/domain/models/motion-data.ts src/lib/shared/pictograph/shared/domain/models/__tests__/motion-data-segment.test.ts
```

---

## Task 2: `_half` asset path in both resolvers

`arrow-path-resolver.ts` has TWO functions — `getArrowPath` (18-52) and `getArrowSvgPath` (57-95). Both build `/images/arrows/${motionType}/...`. A segment motion must resolve to `/images/arrows/${motionType}_half/from_radial/${motionType}_half.svg` (turn-invariant glyph — no `_${turns}` suffix, no skew suffix). Both resolvers get the same additive guard.

**Files:**
- Modify: `src/lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver.ts`
- Test: `src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-path-resolver-half.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-path-resolver-half.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getArrowPath,
  getArrowSvgPath,
} from "$lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createArrowPlacementData } from "$lib/shared/pictograph/arrow/positioning/placement/domain/create-arrow-placement-data";
import {
  MotionType,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

const HALF = { t0: 0, t1: 0.5 };

describe("arrow path resolvers — _half variant (turn-invariant, no skew)", () => {
  it("getArrowPath returns the _half asset for a segment pro motion", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      turns: 1,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    expect(getArrowPath(createArrowPlacementData(), m)).toBe(
      "/images/arrows/pro_half/from_radial/pro_half.svg"
    );
  });

  it("getArrowSvgPath returns the _half asset for a segment anti motion", () => {
    const m = createMotionData({
      motionType: MotionType.ANTI,
      turns: 2,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    expect(getArrowSvgPath(m)).toBe(
      "/images/arrows/anti_half/from_radial/anti_half.svg"
    );
  });

  it("does NOT alter the path for a non-segment (full) motion", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      turns: 1,
      startOrientation: Orientation.IN,
    });
    expect(getArrowPath(createArrowPlacementData(), m)).toBe(
      "/images/arrows/pro/from_radial/pro_1.0.svg"
    );
    expect(getArrowSvgPath(m)).toBe(
      "/images/arrows/pro/from_radial/pro_1.0.svg"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-path-resolver-half.test.ts`
Expected: FAIL — the two `_half` cases return the full `.../pro/from_radial/pro_1.0.svg` path (no `_half` branch yet). The non-segment case already passes.

- [ ] **Step 3: Add the `_half` guard to both resolvers**

In `getArrowPath`, replace lines 22-23:

```ts
  const { motionType, turns } = motionData;
  const baseDir = `/images/arrows/${motionType}`;
```

with:

```ts
  const { motionType, turns } = motionData;

  // Half-motion arrows are a turn-invariant end-direction glyph in a dedicated
  // asset dir; rotation (not a per-turn file) encodes the turns. No skew variant.
  if (motionData.segment) {
    return `/images/arrows/${motionType}_half/from_radial/${motionType}_half.svg`;
  }

  const baseDir = `/images/arrows/${motionType}`;
```

In `getArrowSvgPath`, add immediately after the FLOAT special-case (after line 68, before the `radialPath` computation):

```ts
  if (motionType === MotionType.FLOAT) {
    return "/images/arrows/float.svg";
  }

  if (motionData.segment) {
    return `/images/arrows/${motionType}_half/from_radial/${motionType}_half.svg`;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-path-resolver-half.test.ts`
Expected: PASS — `_half` cases resolve to the new dir; full-motion case unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver.ts src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-path-resolver-half.test.ts
git commit -m "feat(arrow): resolve _half asset dir for segment motions in both path resolvers" -- src/lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver.ts src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-path-resolver-half.test.ts
```

---

## Task 3: Location calculator segment branch

Halving lands on the 45° grid, so the halfway hand location is always a named `GridLocation` (E→S half = SE; S→N dash half = C; E→E static half = E). A segment motion carries it in `endLocation`. The branch returns `motion.endLocation`, placed **above** the `switch` (the switch has no `default` and must stay exhaustive over the closed 5-value `MotionType` — the segment branch is not a 6th case).

**Files:**
- Modify: `src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.ts`
- Test: `.../calculation/services/__tests__/arrow-location-calculator-half.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-location-calculator-half.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { arrowLocationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

const HALF = { t0: 0, t1: 0.5 };

describe("ArrowLocationCalculator — segment branch returns the halfway location", () => {
  it("PRO E→S half → SE (the halfway hand location, carried in endLocation)", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTHEAST,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    expect(arrowLocationCalculator.calculateLocation(m)).toBe(GridLocation.SOUTHEAST);
  });

  it("DASH S→N half → C (center), not routed through dash-location-calculator", () => {
    const m = createMotionData({
      motionType: MotionType.DASH,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.CENTER,
      startOrientation: Orientation.IN,
      segment: HALF,
    });
    // No pictographData passed — the segment branch must short-circuit BEFORE the
    // dash case (which throws/requires pictographData).
    expect(arrowLocationCalculator.calculateLocation(m)).toBe(GridLocation.CENTER);
  });

  it("does NOT affect a full (non-segment) shift", () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
    });
    expect(arrowLocationCalculator.calculateLocation(m)).toBe(GridLocation.SOUTHEAST);
  });
});
```

Note: confirm the center member name (`GridLocation.CENTER` vs `GridLocation.C`) by reading `src/lib/shared/pictograph/grid/domain/enums/grid-enums.ts` before running; adjust if it differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-location-calculator-half.test.ts`
Expected: FAIL — the DASH case throws (dash branch dereferences `pictographData!`), and the PRO segment case may return the shift-pair mapping rather than `endLocation`.

- [ ] **Step 3: Add the segment branch above the switch**

In `arrow-location-calculator.ts`, inside `calculateLocation`, insert before the `switch (motion.motionType)` (line 117):

```ts
    // Half-motion frames carry the halfway hand location in endLocation (halving
    // always lands on the 45° grid → a named GridLocation). Short-circuit before
    // the motion-type switch so a segment DASH never requires pictographData.
    if (motion.segment) {
      return motion.endLocation;
    }

    switch (motion.motionType) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-location-calculator-half.test.ts`
Expected: PASS — segment PRO → SE, segment DASH → C (no throw), full shift unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.ts src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-location-calculator-half.test.ts
git commit -m "feat(arrow): segment location branch returns the halfway grid location" -- src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.ts src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-location-calculator-half.test.ts
```

---

## Task 4: Rotation calculator segment branch (pure, Phase-1-derived)

The half-arrow is an end-direction glyph; its rotation equals the staff angle at the segment's end (`t1`). For on-lattice `t` that staff angle is exactly `orientationToStaffAngle(halfwayOrientation, centerPathAngle(location))` — Phase 1's **pure** bijection. The halfway orientation arrives in `motion.endOrientation` (set upstream). `centerPathAngle(location)` is pure grid geometry (the diamond hand-point angle). No animation-engine import → no `pictograph → animation-engine → pictograph` cycle. The math lives in a pure helper so it unit-tests without the calculator.

`calculateRotation` returns degrees in the pipeline's arrow-rotation convention; the helper converts the bijection's radians to that convention, calibrated against the ground-truth `poseAt` oracle in Step 6.

**Files:**
- Create: `src/lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.ts`
- Modify: `src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator.ts`
- Test: `.../calculation/services/__tests__/arrow-rotation-calculator-half.test.ts`

- [ ] **Step 1: Write the pure helper**

Create `src/lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.ts`:

```ts
import { GridLocation } from "../../../../grid/domain/enums/grid-enums";
import type { Orientation } from "../../../../shared/domain/enums/pictograph-enums";
import { orientationToStaffAngle } from "$lib/shared/render/core/calculations/orientation-angle";

/**
 * Diamond hand-point coordinates in the 950 pictograph viewBox (SVG y-down),
 * from the calibrated grid (see LiftedTurnFrame's grid dots). CENTER has no
 * radial direction; a dash half at center uses the pre-dash cardinal for its
 * center-path reference (handled in centerPathAngleFor).
 */
const CENTER = 475;
const GRID_POINT: Partial<Record<GridLocation, { x: number; y: number }>> = {
  [GridLocation.NORTH]: { x: 475, y: 331.9 },
  [GridLocation.EAST]: { x: 618.1, y: 475 },
  [GridLocation.SOUTH]: { x: 475, y: 618.1 },
  [GridLocation.WEST]: { x: 331.9, y: 475 },
  [GridLocation.NORTHEAST]: { x: 618.1, y: 331.9 },
  [GridLocation.SOUTHEAST]: { x: 618.1, y: 618.1 },
  [GridLocation.SOUTHWEST]: { x: 331.9, y: 618.1 },
  [GridLocation.NORTHWEST]: { x: 331.9, y: 331.9 },
};

/**
 * The center-path angle (radians) for a hand at `location`, i.e. the direction
 * from grid center to the hand, in the engine's convention. For a center
 * location (dash midpoint) there is no outward direction; fall back to the
 * supplied cardinal reference (the pre-dash start location).
 */
export function centerPathAngleFor(
  location: GridLocation,
  centerFallback: GridLocation
): number {
  const pt =
    GRID_POINT[location] ?? GRID_POINT[centerFallback] ?? GRID_POINT[GridLocation.EAST]!;
  // SVG y grows downward; the engine's centerPathAngle is measured in that frame,
  // so atan2(dy, dx) directly (calibrated against poseAt in the calculator test).
  return Math.atan2(pt.y - CENTER, pt.x - CENTER);
}

/**
 * Half-arrow rotation in DEGREES (pipeline arrow-rotation convention): the staff
 * angle at the segment end, from Phase 1's pure orientation→angle bijection.
 * `halfwayOrientation` is the motion's endOrientation (the state at t1).
 */
export function calculateSegmentRotation(
  halfwayOrientation: Orientation,
  location: GridLocation,
  centerFallback: GridLocation
): number {
  const centerPathAngle = centerPathAngleFor(location, centerFallback);
  const staffAngleRad = orientationToStaffAngle(
    halfwayOrientation as Parameters<typeof orientationToStaffAngle>[0],
    centerPathAngle
  );
  const deg = (staffAngleRad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
```

Note: `orientationToStaffAngle` takes the render-core `Orientation` string type; the pictograph `Orientation` enum values are the same strings, so the cast is sound (verify `Orientation.IN === "in"` etc. in `pictograph-enums.ts:102-125`).

- [ ] **Step 2: Write the failing calculator test**

Create `src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-rotation-calculator-half.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { arrowRotationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator";
import { calculateSegmentRotation } from "$lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

const HALF = { t0: 0, t1: 0.5 };

describe("ArrowRotationCalculator — segment branch derives rotation from the halfway orientation", () => {
  it("routes a segment motion to the pure segment-rotation helper", async () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTHEAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.CLOCK, // halfway orientation supplied upstream
      turns: 1,
      segment: HALF,
    });
    const actual = await arrowRotationCalculator.calculateRotation(
      m,
      GridLocation.SOUTHEAST
    );
    const expected = calculateSegmentRotation(
      Orientation.CLOCK,
      GridLocation.SOUTHEAST,
      GridLocation.EAST
    );
    expect(actual).toBeCloseTo(expected, 6);
  });

  it("a full (non-segment) pro motion still uses the pro rotation map (unchanged)", async () => {
    const m = createMotionData({
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      turns: 1,
    });
    const seg = await arrowRotationCalculator.calculateRotation(
      { ...m, segment: HALF, endOrientation: Orientation.CLOCK },
      GridLocation.SOUTHEAST
    );
    const full = await arrowRotationCalculator.calculateRotation(m, GridLocation.SOUTHEAST);
    // The segment path must diverge from the full-motion pro map path.
    expect(seg).not.toBe(full);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-rotation-calculator-half.test.ts`
Expected: FAIL — no segment branch yet, so `calculateRotation` falls into the `pro` case and returns the pro map value, not the helper's value.

- [ ] **Step 4: Add the segment branch to `calculateRotation`**

In `arrow-rotation-calculator.ts`, add the import near the top (after line 21):

```ts
import { calculateHandpathDirection } from "./handpath-direction-calculator";
import { calculateSegmentRotation } from "./segment-rotation";
```

Then insert the branch at the very top of `calculateRotation`, before `const motionType = ...` (line 64):

```ts
    // Half-motion frames: rotation is the staff angle at the segment end, derived
    // from Phase 1's pure orientation→angle bijection (endOrientation carries the
    // halfway orientation). Pure — no animation-engine dependency in this pipeline.
    if (motion.segment) {
      return calculateSegmentRotation(
        motion.endOrientation,
        location,
        motion.startLocation
      );
    }

    const motionType = motion.motionType.toLowerCase();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-rotation-calculator-half.test.ts`
Expected: PASS — segment routes to the helper; full pro unchanged.

- [ ] **Step 6: Calibrate the rotation convention against the `poseAt` ground-truth oracle**

The helper's radian→degree conversion and the `centerPathAngleFor` sign must match the pipeline's arrow-rotation convention AND the physical staff the guide draws. The guide's `poseAt(motion, t).deg` (`src/routes/(public)/guide/level-2/_data/halfway-pose.ts:55-90`) is the ground-truth staff angle. Add this cross-check to the test file (import path is relative — routes are not under `$lib`):

```ts
import { poseAt } from "../../../../../../../routes/(public)/guide/level-2/_data/halfway-pose";
import { calculateOrientationAt } from "$lib/shared/animation-engine/services/orientation-at";

describe("segment rotation matches the guide's physical halfway staff angle (oracle)", () => {
  it("PRO E→S t=1 halfway: helper rotation ≈ poseAt(.,0.5).deg (mod 360)", () => {
    const full = {
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      turns: 1,
    };
    const halfwayOri = calculateOrientationAt(full, 0.5)!;
    const helperDeg = calculateSegmentRotation(
      halfwayOri,
      GridLocation.SOUTHEAST,
      GridLocation.EAST
    );
    const poseDeg = ((poseAt(full as never, 0.5).deg % 360) + 360) % 360;
    // Allow a fixed whole-glyph offset if the pipeline arrow convention differs
    // from the raw staff angle: assert they differ by a CONSTANT across motions.
    expect(Math.abs(((helperDeg - poseDeg + 540) % 360) - 180)).toBeLessThan(1);
  });
});
```

Verify the import path depth to `halfway-pose` at execution time (count the `../` from the test dir to `src/routes`) and adjust. If `poseAt`'s type signature rejects the plain object, wrap it with `createMotionData(full)` as `poseAt` itself does internally. **If the offset is a non-zero constant** (the pipeline applies its own reference rotation to arrow sprites), bake that constant into `calculateSegmentRotation`'s return and re-run — the constant is real calibration, not a fudge; document it in a comment citing the measured `poseDeg`/`helperDeg` pair.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.ts src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator.ts src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-rotation-calculator-half.test.ts
git commit -m "feat(arrow): segment rotation derived from Phase 1 orientation bijection (pure, no engine dep)" -- src/lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.ts src/lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator.ts src/lib/shared/pictograph/arrow/positioning/calculation/services/__tests__/arrow-rotation-calculator-half.test.ts
```

---

## Task 5: Orchestrator — route segment frames around the letter-adjustment machinery

Two additive guards in `calculateArrowPoint` (`arrow-positioning-orchestrator.ts:25-75`): (a) pass an empty letter for segment frames so `getBaseAdjustment`'s `if (letter)` gates skip Special/Global (the `|| "A"` footgun at line 58); (b) short-circuit the adjustment to `{x:0,y:0}` for segment frames (2a baseline; Phase 2b replaces this with authored `_half` nudges). Location + rotation (Tasks 3–4) already flow through unchanged.

**Files:**
- Modify: `src/lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.ts`
- Test: `.../orchestration/services/__tests__/arrow-orchestrator-half.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shared/pictograph/arrow/orchestration/services/__tests__/arrow-orchestrator-half.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calculateArrowPoint } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator";
import { calculateSegmentRotation } from "$lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  MotionColor,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const HALF = { t0: 0, t1: 0.5 };

function segmentPictograph() {
  const motion = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.EAST,
    endLocation: GridLocation.SOUTHEAST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.CLOCK,
    turns: 1,
    color: MotionColor.RED,
    segment: HALF,
  });
  // No letter → the footgun would default to "A" without the guard.
  const picto = {
    letter: null,
    gridMode: motion.gridMode,
    motions: { red: motion, blue: undefined },
  } as unknown as PictographData;
  return { picto, motion };
}

describe("orchestrator — segment frames bypass the letter-adjustment machinery", () => {
  it("positions a letterless half-frame with a {0,0} adjustment (no letter-A tiers)", async () => {
    const { picto, motion } = segmentPictograph();
    const [x, y, rotation] = await calculateArrowPoint(picto, motion);
    // Rotation must equal the segment helper (proves the segment path ran).
    expect(rotation).toBeCloseTo(
      calculateSegmentRotation(Orientation.CLOCK, GridLocation.SOUTHEAST, GridLocation.EAST),
      6
    );
    // Position must be finite and on-canvas (not the error-path scene center only).
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });
});
```

Note: verify `PictographData` shape (`motions.red`/`motions.blue`) against `src/lib/shared/pictograph/shared/domain/models/pictograph-data.ts` before running; the test only needs enough shape for `calculateArrowPoint`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/pictograph/arrow/orchestration/services/__tests__/arrow-orchestrator-half.test.ts`
Expected: FAIL — without the guards, `calculateAdjustment` is invoked with letter `"A"`; depending on the letter-A tables it may return a non-`{0,0}` adjustment or attempt a Special/Global lookup that the minimal fixture can't satisfy. (If it happens to pass, the guard is still required for correctness — proceed to add it.)

- [ ] **Step 3: Add the two segment guards**

In `arrow-positioning-orchestrator.ts`, replace lines 55-62:

```ts
    const adjustment = await arrowAdjustmentCalculator.calculateAdjustment(
      pictographData,
      motion,
      pictographData.letter || "A",
      location,
      motion.color,
      soloMode
    );
```

with:

```ts
    // Half-motion frames are letterless by construction; route them AROUND the
    // letter-based adjustment tiers (Special/Global calibrated for real letters —
    // a "A" default would mis-adjust). Baseline nudge is {0,0}; authored _half
    // default-tier nudges arrive in Phase 2b.
    const adjustment = motion.segment
      ? { x: 0, y: 0 }
      : await arrowAdjustmentCalculator.calculateAdjustment(
          pictographData,
          motion,
          pictographData.letter || "A",
          location,
          motion.color,
          soloMode
        );
```

Confirm `extractAdjustmentValues` (line 64) accepts a plain `{x, y}` — if it expects a richer shape, match it (read `arrow-data-processor.ts`); the `{x:0,y:0}` must yield `[0, 0]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/pictograph/arrow/orchestration/services/__tests__/arrow-orchestrator-half.test.ts`
Expected: PASS — segment frame positions with `{0,0}` adjustment and the segment rotation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.ts src/lib/shared/pictograph/arrow/orchestration/services/__tests__/arrow-orchestrator-half.test.ts
git commit -m "feat(arrow): orchestrator routes segment frames around the letter-adjustment tiers" -- src/lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.ts src/lib/shared/pictograph/arrow/orchestration/services/__tests__/arrow-orchestrator-half.test.ts
```

---

## Task 6: Extract + normalize the four seed glyphs into `_half` assets

The four hand-drawn glyphs live fused (staff-bar subpath + glyph subpath) in `lifted-turn-arrows.ts`. Extraction takes the glyph subpath, un-rotates it to a canonical reference (glyph head points along the staff at rotation 0, matching the app arrow sprites' reference), re-origins to its bounding box, and writes a bare `<svg viewBox><path style="fill:#2e3192"/></svg>` — the exact shape `parseArrowSvg` expects (blue `#2e3192` for runtime recolor; `viewBox ≥ 50` to avoid the dash-rescale branch unless intended).

The extraction is a build script (auditable, re-runnable), not hand-typed path data. First-pass normalization is fine here; Phase 2b refines it visually with Austen.

**Seed frame → glyph subpath map** (subpath index 1 = the end-direction glyph; index 0 = the staff bar):

| Asset | Source frame key | Subpath |
|---|---|---|
| `pro_half` | `p2_s0_f1` | index 1 (curl) |
| `anti_half` | `p2_s1_f1` | index 1 (zig-zag) |
| `dash_half` | `p23_s1_f1` | index 1 (bow) |
| `static_half` | `p23_s2_f3` | index 1 (loop) |

**Files:**
- Create: `scripts/extract-half-glyphs.mjs`
- Create: `static/images/arrows/pro_half/from_radial/pro_half.svg`
- Create: `static/images/arrows/anti_half/from_radial/anti_half.svg`
- Create: `static/images/arrows/dash_half/from_radial/dash_half.svg`
- Create: `static/images/arrows/static_half/from_radial/static_half.svg`
- Test: `.../rendering/services/__tests__/arrow-svg-parser-half.test.ts`

- [ ] **Step 1: Write the failing parser-accepts test**

Create `src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-svg-parser-half.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArrowSvg } from "$lib/shared/pictograph/arrow/rendering/services/arrow-svg-parser";

const ASSETS = ["pro", "anti", "dash", "static"].map(
  (mt) => `static/images/arrows/${mt}_half/from_radial/${mt}_half.svg`
);

describe("_half assets parse cleanly through parseArrowSvg", () => {
  for (const rel of ASSETS) {
    it(`${rel} → valid viewBox + finite center`, () => {
      const svg = readFileSync(resolve(process.cwd(), rel), "utf8");
      const dims = parseArrowSvg(svg);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
      expect(Number.isFinite(dims.center.x)).toBe(true);
      expect(Number.isFinite(dims.center.y)).toBe(true);
      // Bare-path convention: single blue path, runtime-recolored.
      expect(svg).toMatch(/#2e3192/i);
      expect(svg).toMatch(/viewBox\s*=/i);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-svg-parser-half.test.ts`
Expected: FAIL — the four `_half` files do not exist yet (`ENOENT`).

- [ ] **Step 3: Write the extraction script**

Create `scripts/extract-half-glyphs.mjs`. It imports the lifted frame data, selects the glyph subpath per the map above, computes its axis-aligned bounding box by sampling the path (use a minimal SVG path bbox — parse `M`/`L`/`C` command coordinates; the lifted paths use only `M`/`L`/`C`/`Z`), translates the path to a zero-origin `viewBox`, and writes the bare SVG. Un-rotation to the canonical reference is applied as an SVG `transform` baked into the path via a wrapping `<g transform="rotate(...)">` is NOT allowed (parser reads the root path only) — instead emit the glyph at its native orientation for the first pass and record the per-glyph reference offset as a constant consumed by `calculateSegmentRotation` (Task 4 already isolates the convention; add the four per-glyph offsets there in Phase 2b if a glyph's drawn reference differs from north). First pass: emit native-orientation, viewBox-normalized, recolored.

```js
// scripts/extract-half-glyphs.mjs
// Run: node scripts/extract-half-glyphs.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { LIFTED_TURN_FRAMES } from "../src/routes/(public)/guide/level-2/_data/lifted-turn-arrows.ts";

const SEEDS = [
  { mt: "pro", frame: "p2_s0_f1", idx: 1 },
  { mt: "anti", frame: "p2_s1_f1", idx: 1 },
  { mt: "dash", frame: "p23_s1_f1", idx: 1 },
  { mt: "static", frame: "p23_s2_f3", idx: 1 },
];

const BLUE = "#2e3192";
const num = /-?\d+(?:\.\d+)?/g;

/** Bounding box over all coordinate pairs in an M/L/C/Z path `d`. */
function bbox(d) {
  const nums = (d.match(num) ?? []).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Translate every coord pair in `d` by (-dx,-dy). Preserves command letters. */
function translate(d, dx, dy) {
  let k = 0;
  return d.replace(num, (m) => {
    const v = Number(m) - (k++ % 2 === 0 ? dx : dy);
    return v.toFixed(2);
  });
}

for (const { mt, frame, idx } of SEEDS) {
  const paths = LIFTED_TURN_FRAMES[frame];
  if (!paths || !paths[idx]) throw new Error(`missing ${frame}[${idx}]`);
  const d0 = paths[idx].d;
  const b = bbox(d0);
  const pad = 4;
  const w = (b.maxX - b.minX + pad * 2).toFixed(2);
  const h = (b.maxY - b.minY + pad * 2).toFixed(2);
  const d = translate(d0, b.minX - pad, b.minY - pad);
  const svg =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" xml:space="preserve">` +
    `<path d="${d}" style="fill:${BLUE}"/></svg>`;
  const out = resolve(
    process.cwd(),
    `static/images/arrows/${mt}_half/from_radial/${mt}_half.svg`
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, svg, "utf8");
  console.log(`wrote ${out} (viewBox 0 0 ${w} ${h})`);
}
```

Note: importing a `.ts` from a `.mjs` node script requires a TS-aware loader. If `node` cannot import the `.ts` directly in this repo, run via the repo's existing script runner (check `package.json` scripts for a `tsx`/`vite-node` invocation pattern used by other `scripts/*.mjs`, e.g. `npx vite-node scripts/extract-half-glyphs.mjs`); or copy the four `LiftedPath` `d` strings into the script as literals (they are static, committed data). Prefer the loader; fall back to literals only if no loader is configured.

- [ ] **Step 4: Run the extraction script**

Run: `npx vite-node scripts/extract-half-glyphs.mjs` (or the repo's TS-script runner)
Expected: writes four files, logs each viewBox. Confirm each file exists and contains one `<path style="fill:#2e3192">`.

- [ ] **Step 5: Run the parser test to verify it passes**

Run: `npx vitest run src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-svg-parser-half.test.ts`
Expected: PASS — all four assets parse with positive dimensions and finite centers. If `dash_half`'s viewBox came out `< 50` on both axes, the parser will rescale it to 250 (acceptable, but note it); widen the pad or confirm the bow's native size is ≥ 50.

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-half-glyphs.mjs static/images/arrows/pro_half static/images/arrows/anti_half static/images/arrows/dash_half static/images/arrows/static_half src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-svg-parser-half.test.ts
git commit -m "feat(assets): extract the four hand-drawn seed glyphs into normalized _half arrow assets" -- scripts/extract-half-glyphs.mjs static/images/arrows/pro_half static/images/arrows/anti_half static/images/arrows/dash_half static/images/arrows/static_half src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-svg-parser-half.test.ts
```

---

## Task 7: End-to-end positioning integration test + visual proof page

Prove the seven target half-motions flow through the whole pipeline (`calculateArrowPoint`) to a finite on-canvas position and the Phase-1-derived rotation, and give Austen a real page to look at.

**Files:**
- Create: `src/lib/shared/pictograph/arrow/positioning/__tests__/half-arrow-pipeline.test.ts`
- Create: `src/routes/test/half-arrows/+page.svelte`

- [ ] **Step 1: Write the integration test**

Create `src/lib/shared/pictograph/arrow/positioning/__tests__/half-arrow-pipeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calculateArrowPoint } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator";
import { calculateSegmentRotation } from "$lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation";
import { calculateOrientationAt } from "$lib/shared/animation-engine/services/orientation-at";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  MotionColor,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

type Target = {
  name: string;
  motionType: MotionType;
  start: GridLocation;
  end: GridLocation;
  halfwayLoc: GridLocation;
  turns: number;
};

// The seven half-motions the guide's turn pages need (spec §6 / plan scope table).
const TARGETS: Target[] = [
  { name: "pro E→S t1", motionType: MotionType.PRO, start: GridLocation.EAST, end: GridLocation.SOUTH, halfwayLoc: GridLocation.SOUTHEAST, turns: 1 },
  { name: "anti E→S t1", motionType: MotionType.ANTI, start: GridLocation.EAST, end: GridLocation.SOUTH, halfwayLoc: GridLocation.SOUTHEAST, turns: 1 },
  { name: "pro E→S t2", motionType: MotionType.PRO, start: GridLocation.EAST, end: GridLocation.SOUTH, halfwayLoc: GridLocation.SOUTHEAST, turns: 2 },
  { name: "anti E→S t2", motionType: MotionType.ANTI, start: GridLocation.EAST, end: GridLocation.SOUTH, halfwayLoc: GridLocation.SOUTHEAST, turns: 2 },
  { name: "dash S→N t2", motionType: MotionType.DASH, start: GridLocation.SOUTH, end: GridLocation.NORTH, halfwayLoc: GridLocation.CENTER, turns: 2 },
  { name: "static E→E t2", motionType: MotionType.STATIC, start: GridLocation.EAST, end: GridLocation.EAST, halfwayLoc: GridLocation.EAST, turns: 2 },
];

function halfMotion(t: Target) {
  const full = {
    motionType: t.motionType,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: t.start,
    endLocation: t.end,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: t.turns,
  };
  const halfwayOri = calculateOrientationAt(full as never, 0.5);
  return { full, halfwayOri };
}

describe("half-arrow pipeline — seven guide motions position + rotate correctly", () => {
  for (const t of TARGETS) {
    it(`${t.name}: finite on-canvas position + Phase-1-derived rotation`, async () => {
      const { halfwayOri } = halfMotion(t);
      expect(halfwayOri, `${t.name} must be on-lattice (non-null)`).not.toBeNull();

      const motion = createMotionData({
        motionType: t.motionType,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: t.start,
        endLocation: t.halfwayLoc,
        startOrientation: Orientation.IN,
        endOrientation: halfwayOri!,
        turns: t.turns,
        color: MotionColor.RED,
        segment: { t0: 0, t1: 0.5 },
      });
      const picto = {
        letter: null,
        gridMode: motion.gridMode,
        motions: { red: motion, blue: undefined },
      } as unknown as PictographData;

      const [x, y, rotation] = await calculateArrowPoint(picto, motion);
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(rotation).toBeCloseTo(
        calculateSegmentRotation(halfwayOri!, t.halfwayLoc, t.start),
        6
      );
    });
  }
});
```

Note: two of the seven (anti E→S t2 variants) collapse to the same inputs here; that is fine — the guide distinguishes them by strip framing (halves vs the in→out combined), not by different half-arrow geometry.

**The assertion above is SELF-CONSISTENT (rotation == the helper) — it does NOT catch a wrong rotation.** Add a ground-truth cross-check against `poseAt` for ALL seven, mirroring exactly what the Task 4 implementer proved works (build a SECOND object in `poseAt`'s `HalfwayMotion` field shape — `poseAt` destructures different field names than `OrientationAtInput`; passing the wrong shape silently degrades to defaults and makes the oracle meaningless — read `halfway-pose.ts` for the exact field names). Append per target:

```ts
      // Ground-truth: the pipeline rotation must equal the physical halfway staff
      // angle the guide draws (poseAt), not merely be self-consistent.
      const poseDeg = ((poseAt(poseInputFor(t), 0.5).deg % 360) + 360) % 360;
      expect(
        Math.abs(((rotation - poseDeg + 540) % 360) - 180),
        `${t.name}: pipeline ${rotation}° vs physical ${poseDeg}°`
      ).toBeLessThan(1);
```

where `poseInputFor(t)` builds the `HalfwayMotion`-shaped object for target `t`. Import `poseAt` from `halfway-pose.ts` (relative path — routes are not under `$lib`; count the `../`).

**KNOWN FAILURE this cross-check WILL surface (measured in Task 4):** the DASH S→N target fails by 90° (pipeline 180° vs physical 90°). Root cause: the animation engine's `centerPathAngle` at the exact midpoint of a straight-through-center dash degenerates (opposite unit vectors cancel), so it is NOT the pre-dash cardinal that `centerPathAngleFor`'s `centerFallback` currently substitutes. **Fix `centerPathAngleFor`'s CENTER-location handling to match `poseAt`'s physical angle** (derive the correct center reference from the oracle — do NOT weaken the assertion). The other six pass exact. This is the intended, oracle-driven find; resolving it is part of Task 7, not a separate task.

**The fix is already derived (algebra confirms it):** `LOCATION_ANGLES[GridLocation.CENTER] === 0`. Task 4's dedup added a `location === CENTER ? centerFallback : location` special-case in `centerPathAngleFor` purely to preserve the (buggy) pre-dedup behavior. For the S→N dash halfway, `halfwayOrientation === "clock"` and `orientationToStaffAngle("clock", 0) === PI/2 === 90° === poseDeg`. So the fix is to **remove that CENTER special-case for the rotation path** and let `LOCATION_ANGLES[CENTER] = 0` flow through. Verify with the oracle (it forces correctness regardless). Scope caveat: `cpa = 0` is oracle-verified for the S→N dash target only; other through-center dashes are outside the seven-target scope (Phase 3/4). Keep the `centerFallback` parameter — a future non-center use may still want it — but stop special-casing CENTER to it.

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run src/lib/shared/pictograph/arrow/positioning/__tests__/half-arrow-pipeline.test.ts`
Expected on first run: six green, DASH S→N RED at the `poseAt` cross-check (90° off) per the known failure above. Fix `centerPathAngleFor`'s center handling against the `poseAt` ground truth, re-run until all seven pass exact. A `toBeNull` failure on any target means that motion is off-lattice (should not happen — all are whole-turn); investigate before weakening. When green, this test is the proof that every guide half-arrow lands at the physically-correct rotation.

- [ ] **Step 3: Build the visual proof page**

Create `src/routes/test/half-arrows/+page.svelte` rendering each target's `_half` arrow through the REAL arrow render component at its computed `[x, y, rotation]`, over a diamond grid, so Austen can eyeball fidelity. Reuse the existing arrow render primitive — grep for how `PictographRenderer.svelte` mounts `ArrowSvg.svelte` (it passes `arrowData` with `positionX/positionY/rotationAngle`); construct one `ArrowSvg` per target with the values from `calculateArrowPoint`. Do NOT hand-roll an arrow renderer (`never-hand-roll`). Keep it a plain grid of labeled cells (one per target), each a small SVG viewport with the grid dots (reuse `LiftedTurnFrame`'s dot coords) + the positioned half-arrow.

Minimum viable page (reconcile prop names against `ArrowSvg.svelte` at execution time):

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { calculateArrowPoint } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator";
  import { calculateOrientationAt } from "$lib/shared/animation-engine/services/orientation-at";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    MotionType, MotionColor, Orientation, RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  // Same TARGETS as the integration test (copy the array).
  let cells = $state<Array<{ name: string; x: number; y: number; rot: number; href: string }>>([]);

  onMount(async () => {
    // For each target: build the segment motion, calculateArrowPoint, resolve the
    // _half asset href via getArrowSvgPath, push into cells. Render below.
  });
</script>

<!-- Grid of <svg viewBox="0 0 950 950"> per cell: dots + <image href={href}
     transform={`translate(${x} ${y}) rotate(${rot})`} /> or the real ArrowSvg. -->
```

Flesh this out to actually render (the test already proves the numbers; this page is for the human visual gate). Serve at `https://localhost:5174/test/half-arrows` from a worktree dev server if verifying visually (never touch `:5173`). This page is the Phase 2b review surface.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/pictograph/arrow/positioning/__tests__/half-arrow-pipeline.test.ts src/routes/test/half-arrows/+page.svelte
git commit -m "test(arrow): end-to-end half-arrow positioning over the seven guide motions + visual proof page" -- src/lib/shared/pictograph/arrow/positioning/__tests__/half-arrow-pipeline.test.ts src/routes/test/half-arrows/+page.svelte
```

---

## Task 8: Phase 2a gate + spec ledger

- [ ] **Step 1: Run the scoped test + type gate once**

Run: `npx vitest run src/lib/shared/pictograph/arrow src/lib/shared/pictograph/shared/domain/models`
Expected: all new segment/half suites green; no existing arrow test regressed.

Run: `npx tsc --noEmit -p .svelte-kit/tsconfig.json > $CLAUDE_JOB_DIR/tmp/p2-tsc.log 2>&1; grep -niE "segment-rotation|arrow-path-resolver|arrow-location-calculator|arrow-rotation-calculator|arrow-positioning-orchestrator|motion-data" $CLAUDE_JOB_DIR/tmp/p2-tsc.log` (dev-server-safe — no `svelte-kit sync`).
Expected: 0 errors attributable to the Phase-2a files (pre-existing project errors from other sessions may appear — confirm none are in the touched files).

- [ ] **Step 2: Tick the Phase 2 ledger in the spec**

In `docs/superpowers/specs/2026-07-14-halved-pictograph-pipeline-design.md` §11, check the Phase 2 boxes that 2a completes: `MotionData.segment`, location branch, rotation branch, `_half` baseDir, footgun routing, glyph extraction (mark the placement-JSON item as **2b — deferred**). Note the four §6 refinements (turn-invariant glyphs; derived rotation; optional centerPoint; sibling-loader-in-2b) and any rotation calibration constant measured in Task 4 Step 6.

- [ ] **Step 3: Commit the ledger update**

```bash
git add docs/superpowers/specs/2026-07-14-halved-pictograph-pipeline-design.md
git commit -m "docs(spec): mark halved-pictograph Phase 2a complete; record §6 refinements" -- docs/superpowers/specs/2026-07-14-halved-pictograph-pipeline-design.md
```

---

## Phase 2b — visual tuning (post-2a; requires Austen's eye)

Not TDD. Gated on a visual pass on `/test/half-arrows`. Do NOT start until 2a is green.

- **Screenshot review vs the artboards.** Render `/test/half-arrows`; compare each half-glyph's placement + rotation to the guide's drawn frames (`lifted-turn-arrows.ts` / the source PDF). Austen confirms fidelity or flags per-glyph drift.
- **Per-glyph reference offset.** If an extracted glyph's drawn "head" reference differs from north, add its constant offset to `calculateSegmentRotation` (the convention is already isolated there). Measure the offset off the review, don't guess.
- **Authored `_half` default-tier nudges.** For any scenario where `{0,0}` looks off, author a `default_diamond_{mt}_half_placements.json` entry. Load it via a **sibling `_half` bucket** in `ArrowPlacer` (do NOT extend the hardcoded `motionTypes` array at `arrow-placer.ts:54`), and swap the orchestrator's `{x:0,y:0}` segment guard for the real lookup. Key scheme: flat `{mt}_half` (letterless — half frames have no letter/position context).
- **`getArrowSvgPath` vs `getArrowPath` call-path audit.** Confirm which resolver the live render path uses (both were branched in Task 2); if only one is live, note the other as defensive.

Phase 2b closes when Austen signs off on the visual pass. Phase 3 (`buildHalvedStep` + `showArrow` + guide rewire) then consumes this arrow.

---

## Self-Review

**Spec coverage (§6 Phase 2 ledger):**
- `MotionData.segment` field + factory → Task 1. ✓
- `arrow-location-calculator` half branch → Task 3 (returns halfway `endLocation`; `shiftHalfDirectionPairs` proved unnecessary — halving lands on the grid, so `endLocation` is exact). ✓ (documented deviation)
- `arrow-rotation-calculator` half branch → Task 4 (derived from Phase 1 bijection, not authored maps — documented refinement #2). ✓
- `default_diamond_{mt}_half_placements.json` + key-gen recognition → **Phase 2b** (2a baselines at `{0,0}` via the orchestrator guard; authored nudges are visual tuning). Deferred by design. ✓
- `arrow-path-resolver` `_half` baseDir → Task 2 (both resolvers). ✓
- Route around the `letter||"A"` footgun → Task 5. ✓
- Normalize guide glyphs → `_half` assets → Task 6 (extraction script + four assets; turn-invariant, so four not a family — refinement #1). ✓

**Placeholder scan:** No TBD/TODO. The "verify enum member / reconcile prop names / calibrate against oracle" notes (Tasks 3, 4, 5, 7) are execution-time reconciliations against real files with a defined oracle — the same pattern the Phase 1 plan used, not missing logic. Task 6's script is complete real code; the `.ts`-import caveat has a defined fallback. Task 7's `+page.svelte` is intentionally a scaffold-to-flesh-out because it is the human visual surface (its correctness is a screenshot, not an assertion) — the *numbers* it displays are proven by the Task 7 integration test.

**Type consistency:** `calculateSegmentRotation(halfwayOrientation, location, centerFallback)` and `centerPathAngleFor(location, centerFallback)` are defined in Task 4 and consumed identically in Tasks 5 and 7. `segment: {t0,t1}` shape is stable across all tasks. `getArrowPath`/`getArrowSvgPath` `_half` format (`/images/arrows/${mt}_half/from_radial/${mt}_half.svg`) matches the Task 6 asset paths and the Task 6 test. Location branch returns `motion.endLocation` consistently.

**Known execution risks (flagged, not gaps):**
- **Rotation convention offset (Task 4 Step 6).** The bijection radians→pipeline degrees may carry a constant reference offset; the `poseAt` oracle measures it. If non-zero, bake the measured constant. Anticipated, with a defined resolution.
- **`.ts` import in the Node extraction script (Task 6 Step 3).** Defined fallback: repo TS-runner, or inline the four static `d` literals.
- **Center-family / off-lattice inputs.** All seven targets are whole-turn (on-lattice); the pipeline is not exercised for off-lattice halves here (they stay on the visual `poseArrow` path per Phase 3). `calculateOrientationAt` returns `null` for those — the integration test asserts non-null for the seven, catching any surprise.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-halved-pictograph-phase-2-arrow-identity.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, spec-then-quality review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
