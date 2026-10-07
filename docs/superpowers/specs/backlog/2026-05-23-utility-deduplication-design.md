---
status: backlog
value: 2
effort: M
remaining: Recheck math/format utility duplication and word-simplifier ownership against current source before assigning a deduplication slice.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Utility Deduplication Design

> **DRIFT WARNING — 2026-08-02.** Phase 4 (word-simplifier) shipped independently; `math.ts`/`format.ts` never created, ~12 `lerp` definitions remain
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-05-23
**Status:** Backlog

## Problem

Basic math and formatting utilities are copy-pasted across the codebase. This creates drift risk (implementations already differ in subtle ways), inflates bundle size, and makes bug fixes require shotgun surgery.

## Audit Summary

### `lerp` -- 11 definitions

All compute `a + (b - a) * t` except one.

| Location | Signature | Formula | Exported |
|---|---|---|---|
| `shared/3d/services/angle-math-calculator.ts:36` | `(a, b, t)` | `a + (b - a) * t` | yes |
| `shared/3d/camera/transitions.ts:16` | `(a, b, t)` | `a + (b - a) * t` | yes |
| `shared/ui-animation/presets.ts:114` | `(start, end, progress)` | `start + (end - start) * progress` | yes |
| `shared/animation-engine/services/angle-calculator.ts:69` | `(a, b, t)` | **`a * (1 - t) + b * t`** | yes |
| `features/learn/domain/constants/motion-visualizer-data.ts:69` | `(a, b, t)` | `a + (b - a) * t` | yes |
| `features/lab/tabs/collision-lab/.../StanceOptimizer.ts:396` | `(a, b, t)` | `a + (b - a) * t` | no (local) |
| `features/museum/state/museum-state.svelte.ts:29` | `(a, b, t)` | `a + (b - a) * t` | no (local) |
| `shared/animation-engine/domain/types/FireTypes.ts:303` | `(a, b, t)` | `a + (b - a) * t` | no (local) |
| `shared/animation-engine/domain/types/CharcoalSparkTypes.ts:227` | `(a, b, t)` | `a + (b - a) * t` | no (local) |
| `shared/3d/services/implementations/StageSceneAdapter.ts:360` | `(a, b, t)` | `a + (b - a) * t` | no (local) |
| `shared/3d/procedural-engine/generation/seed-generator.ts:118` | `(a, b, t)` | `a + t * (b - a)` | no (local) |

**Behavioral difference:** `angle-calculator.ts` uses `a * (1 - t) + b * t`. Mathematically equivalent, but has slightly different floating-point rounding. All other implementations use the `a + (b - a) * t` form. The canonical form should be `a + (b - a) * t` (standard in graphics, minimizes operations).

### `lerpAngle` -- 3 definitions

All take shortest path, but differ in normalization strategy.

| Location | Normalization | Output range |
|---|---|---|
| `angle-math-calculator.ts:41` | Manual modulo + branch | `[0, 2pi)` via `normalizeAngle` |
| `camera/transitions.ts:44` | `normalizeAngle(b - a)` (while-loop, signed) | `[-pi, pi]` via local `normalizeAngle` |
| `angle-calculator.ts:77` | `normalizeAngleSigned(b - a)` | `[0, 2pi)` via `normalizeAnglePositive` |

**Behavioral difference:** `transitions.ts` outputs `[-pi, pi]` while the other two output `[0, 2pi)`. The camera system expects signed angles for yaw/pitch. The animation system expects positive angles. Both semantics are needed; they should be two named functions (`lerpAngle` for `[0, 2pi)`, `lerpAngleSigned` for `[-pi, pi]`), not three files with the same name doing different things.

### `lerpAngleDirectional` -- 2 definitions

Both fall back to `lerpAngle` for `NO_ROTATION` and force CW/CCW via delta adjustment.

| Location | Difference |
|---|---|
| `angle-math-calculator.ts:52` | Operates on raw inputs, does not pre-normalize |
| `angle-calculator.ts:92` | Pre-normalizes both angles to `[0, 2pi)` before computing delta |

**Behavioral difference:** Pre-normalization changes behavior when inputs are outside `[0, 2pi)`. The `angle-calculator.ts` version is more robust. The `angle-math-calculator.ts` version may produce wrong direction for large negative angles. Canonical should be the pre-normalizing version.

### `normalizeAngle` / `normalizeAnglePositive` -- 4 definitions (2 radians, 2 degrees)

| Location | Unit | Output range | Method |
|---|---|---|---|
| `angle-math-calculator.ts:23` | radians | `[0, 2pi)` | modulo + branch |
| `angle-calculator.ts:32` (`normalizeAnglePositive`) | radians | `[0, 2pi)` | modulo + ternary |
| `camera/transitions.ts:34` | radians | `[-pi, pi]` | while-loop |
| `arrow-coordinate-transformer.ts:74` | **degrees** | `[0, 360)` | modulo + branch |
| `mandala-transformer.ts:21` | **degrees** | `[0, 360)` | modulo + branch (local, same as above) |

The degree-based versions serve a different domain (2D SVG/pictograph coordinates). They should stay separate from the radian math utilities but could share a file with the other degree-based arrow utilities. The camera transitions `normalizeAngle` should become `normalizeAngleSigned` from the shared module.

### `normalizeAngleSigned` -- 2 definitions

| Location | Implementation |
|---|---|
| `angle-math-calculator.ts:30` | `normalizeAngle` then branch at PI |
| `angle-calculator.ts:37` | `normalizeAnglePositive` then branch at PI |

Functionally identical. No behavioral difference.

### `clamp` -- 8 definitions

All compute `Math.max(min, Math.min(max, value))` with trivial parameter naming differences. Two Svelte components (`ParamSlider`, `PropButtonLab`) have 2-arg versions that capture `min`/`max` from component scope -- these are fine as closures, not candidates for extraction.

| Location | Exported |
|---|---|
| `shared/3d/camera/transitions.ts:96` | yes |
| `shared/animation-engine/domain/patterns/tka-aware.ts:7` | no (local) |
| `shared/render-graph/translators/TrailTranslator.ts:103` | no (local) |
| `features/assemble-lab/services/timing-interpreter.ts:17` | no (local) |
| `features/lab/tabs/collision-lab/.../StanceOptimizer.ts:392` | no (local) |
| `features/lab/tabs/scene-lab/components/ParamSlider.svelte:21` | no (2-arg closure) |
| `features/lab/tabs/PropButtonLab.svelte:155` | no (2-arg closure) |
| `features/poi/components/ScrubValue.svelte:44` | no (2-arg closure) |

### `formatTime` -- 4 definitions with 3 different input types

| Location | Input | Semantics |
|---|---|---|
| `shared/sequence-viewer/utils/format-time.ts:9` | seconds (number) | `m:ss` |
| `features/learn/quiz/quiz-results-analyzer.ts:182` | seconds (number) | `m:ss` (identical) |
| `features/write/domain/types/write.ts:113` | **milliseconds** (number) | divides by 1000 first, then `m:ss` |
| `shared/inbox/utils/format.ts:46` | **Date object** | `toLocaleTimeString` (completely different purpose) |

The first two are identical. The ms-input version just divides first. The Date version is a time-of-day formatter, not a duration formatter -- it should keep its name and location.

### `formatDate` -- 3 definitions

| Location | Input | Behavior |
|---|---|---|
| `shared/i18n/i18n-formatters.ts:54` | `Date \| number \| string` | Locale-aware via `Intl.DateTimeFormat` with cached formatters and options |
| `features/learn/quiz/quiz-results-analyzer.ts:220` | `Date` | `toLocaleDateString()` (no options) |
| `features/feedback/services/feedback-formatter.ts:13` | `Date` | `Intl.DateTimeFormat("en-US", {dateStyle:"medium", timeStyle:"short"})` |

The i18n version is the canonical formatter. The quiz version is a minimal wrapper. The feedback version is hardcoded to en-US with a specific style -- it should call the i18n formatter with `{ dateStyle: "medium", timeStyle: "short" }`.

### `word-simplifier.ts` -- 2 identical copies in app source

| Location | Notes |
|---|---|
| `shared/foundation/utils/word-simplifier.ts` | Canonical. 22 import sites across the codebase. |
| `features/create/shared/workspace-panel/shared/utils/word-simplifier.ts` | Legacy location. 1 direct import (WordLabel.svelte). Test file imports from here. |

Byte-for-byte identical (270 lines each, same content). The `foundation` version is already the canonical import for 22 files. Only `WordLabel.svelte` and the test file still import from the `create/` copy.

## Design

### 1. New file: `$lib/shared/utils/math.ts`

```typescript
/**
 * Core math utilities. Single source of truth for lerp, clamp,
 * and angle interpolation across the entire codebase.
 */

const TWO_PI = Math.PI * 2;
const PI = Math.PI;

/** Linear interpolation: a + (b - a) * t */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp value to [min, max] range */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Normalize angle to [0, 2pi) */
export function normalizeAngle(angle: number): number {
  const norm = angle % TWO_PI;
  return norm < 0 ? norm + TWO_PI : norm;
}

/** Normalize angle to (-pi, pi] (signed) */
export function normalizeAngleSigned(angle: number): number {
  const norm = normalizeAngle(angle);
  return norm > PI ? norm - TWO_PI : norm;
}

/** Shortest-path angle interpolation. Output in [0, 2pi). */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = normalizeAngleSigned(b - a);
  return normalizeAngle(a + d * t);
}

/** Shortest-path angle interpolation. Output in (-pi, pi]. */
export function lerpAngleSigned(a: number, b: number, t: number): number {
  const diff = normalizeAngleSigned(b - a);
  return normalizeAngleSigned(a + diff * t);
}

/**
 * Directional angle interpolation respecting explicit CW/CCW.
 * Pre-normalizes inputs for robustness with out-of-range angles.
 */
export function lerpAngleDirectional(
  startAngle: number,
  endAngle: number,
  direction: 'cw' | 'ccw' | 'none',
  progress: number
): number {
  if (direction === 'none') {
    return lerpAngle(startAngle, endAngle, progress);
  }

  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(endAngle);
  let delta = end - start;

  if (direction === 'cw') {
    if (delta > 0) delta -= TWO_PI;
  } else {
    if (delta < 0) delta += TWO_PI;
  }

  return normalizeAngle(start + delta * progress);
}
```

**Note on `lerpAngleDirectional` signature:** The current implementations import `RotationDirection` enum from the pictograph domain. The shared math module should not depend on domain enums. Two options:

- **Option A (recommended):** Use string literal union (`'cw' | 'ccw' | 'none'`) in `math.ts`. The two calling modules (`angle-math-calculator.ts`, `angle-calculator.ts`) keep thin wrappers that map `RotationDirection` to the string union. This keeps the math module dependency-free.
- **Option B:** Accept the enum as a generic parameter with a mapping function. Adds unnecessary complexity.

### 2. New file: `$lib/shared/utils/format.ts`

```typescript
/**
 * Duration and date formatting utilities.
 */

/**
 * Format a duration as m:ss.
 * Accepts seconds by default. Pass `{ unit: 'ms' }` for milliseconds.
 */
export function formatDuration(
  value: number,
  opts?: { unit?: 'ms' | 's' }
): string {
  const sec = opts?.unit === 'ms' ? Math.floor(value / 1000) : Math.floor(value);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
```

Rename from `formatTime` to `formatDuration` to distinguish from the inbox `formatTime(date: Date)` which formats time-of-day. The inbox version stays in `shared/inbox/utils/format.ts` -- it is a different function.

For `formatDate`: the canonical implementation already exists at `shared/i18n/i18n-formatters.ts`. No new file needed. The two downstream copies should import from there.

### 3. Word simplifier deduplication

- Delete `features/create/shared/workspace-panel/shared/utils/word-simplifier.ts`
- Update `WordLabel.svelte` import to `$lib/shared/foundation/utils/word-simplifier`
- Update test file import to `../../../src/lib/shared/foundation/utils/word-simplifier`

## Migration Plan

### Phase 1: Create shared modules (non-breaking)

1. Create `$lib/shared/utils/math.ts` with `lerp`, `clamp`, `normalizeAngle`, `normalizeAngleSigned`, `lerpAngle`, `lerpAngleSigned`, `lerpAngleDirectional`
2. Create `$lib/shared/utils/format.ts` with `formatDuration`
3. Run `npm run check` to verify new files compile

### Phase 2: Migrate exported definitions

Update files that export these functions to re-export from the shared module or replace with imports. Order by dependency depth (leaf modules first).

**lerp (exported, 5 files):**

| File | Action |
|---|---|
| `ui-animation/presets.ts` | Replace definition with `export { lerp } from '$lib/shared/utils/math'` |
| `camera/transitions.ts` | Replace `lerp` + `clamp` definitions with imports. Keep `lerpVector3`, `slerpRotation`, `cubicBezier`, `easeOutCubic`, `easeInCubic`, `distance` (camera-specific). Replace local `normalizeAngle` + `lerpAngle` with `lerpAngleSigned` import. |
| `learn/.../motion-visualizer-data.ts` | Replace definition with import |
| `angle-math-calculator.ts` | Replace `lerp`, `normalizeAngle`, `normalizeAngleSigned`, `lerpAngle` with imports. Keep `lerpAngleDirectional` as a thin wrapper that maps `RotationDirection` to the string union. Keep `AngleMathCalculatorAPI` interface. |
| `angle-calculator.ts` | Same pattern. Replace shared math with imports. Keep `mapPositionToAngle`, `mapOrientationToAngle`, `createAngleCalculator` (domain-specific). |

**formatTime (exported, 3 files):**

| File | Action |
|---|---|
| `sequence-viewer/utils/format-time.ts` | Replace body with `export { formatDuration as formatTime } from '$lib/shared/utils/format'`. Keeps all 6 downstream import sites working without changes. Deprecation comment. |
| `learn/quiz/quiz-results-analyzer.ts` | Delete local `formatTime`, import from `$lib/shared/utils/format` as `formatDuration` |
| `write/domain/types/write.ts` | Delete local `formatTime`, import `formatDuration` with `{ unit: 'ms' }` |

**formatDate (2 files to fix):**

| File | Action |
|---|---|
| `learn/quiz/quiz-results-analyzer.ts` | Delete local `formatDate`, import from `$lib/shared/i18n/i18n-formatters` |
| `feedback/services/feedback-formatter.ts` | Replace body with call to i18n `formatDate(date, { dateStyle: 'medium', timeStyle: 'short' })`. Note: this changes from hardcoded en-US to locale-aware. If locale-awareness is unwanted, keep as-is with a comment explaining the intentional en-US pinning. |

**normalizeAngle (degrees, 2 files):**

| File | Action |
|---|---|
| `arrow-coordinate-transformer.ts:74` | Keep. Degree-based, different domain from radian math. |
| `mandala-transformer.ts:21` | Could import from arrow-coordinate-transformer, but it is a local helper. Low priority. |

### Phase 3: Migrate local (non-exported) definitions

Replace private `function lerp` and `function clamp` in 11+ files with imports from `$lib/shared/utils/math`. Each is a mechanical change: add import, delete local function.

**Files with local `lerp` to migrate:**
- `StanceOptimizer.ts`
- `museum-state.svelte.ts`
- `FireTypes.ts`
- `CharcoalSparkTypes.ts`
- `StageSceneAdapter.ts`
- `seed-generator.ts`

**Files with local `clamp` to migrate:**
- `tka-aware.ts`
- `TrailTranslator.ts`
- `timing-interpreter.ts`
- `StanceOptimizer.ts`

**Files with 2-arg `clamp` closures (skip):**
- `ParamSlider.svelte` -- closure captures `min`/`max` from props
- `PropButtonLab.svelte` -- same pattern
- `ScrubValue.svelte` -- same pattern

### Phase 4: Delete the word-simplifier duplicate

1. Update `WordLabel.svelte` import path from `../../shared/utils/word-simplifier` to `$lib/shared/foundation/utils/word-simplifier`
2. Update `tests/unit/utils/word-simplifier.test.ts` import path to `../../../src/lib/shared/foundation/utils/word-simplifier`
3. Delete `src/lib/features/create/shared/workspace-panel/shared/utils/word-simplifier.ts`

### Phase 5: Verify

- `npm run check` (typecheck)
- `npx vitest run tests/unit/utils/word-simplifier.test.ts` (word-simplifier tests still pass)
- `npm run build` (no dead imports, tree shaking works)

## Risks

1. **`angle-calculator.ts` lerp formula change:** Switching from `a * (1 - t) + b * t` to `a + (b - a) * t` introduces sub-ULP floating-point differences. For animation interpolation this is irrelevant (the difference is ~1e-16), but if any test uses exact equality against the old formula, it will fail. Mitigation: run full test suite after migration.

2. **`camera/transitions.ts` normalizeAngle range change:** The camera system uses `[-pi, pi]` output from `lerpAngle`. Switching to the shared `lerpAngle` (which outputs `[0, 2pi)`) would break camera rotation. Must use `lerpAngleSigned` for the camera system.

3. **`lerpAngleDirectional` pre-normalization:** The `angle-math-calculator.ts` version does not pre-normalize, but consumers in `shared/3d/` may rely on this behavior with already-normalized inputs. The pre-normalizing version is strictly more correct (handles edge cases). No expected breakage, but worth running 3D animation regression tests.

4. **`formatDate` locale change in feedback module:** Switching from hardcoded `en-US` to locale-aware formatting changes output for non-English users. This is probably desired but should be a conscious choice. Flag in PR description.

## File Inventory

New files created:
- `src/lib/shared/utils/math.ts`
- `src/lib/shared/utils/format.ts`

Files modified (Phase 2, exported definitions):
- `src/lib/shared/3d/services/angle-math-calculator.ts`
- `src/lib/shared/animation-engine/services/angle-calculator.ts`
- `src/lib/shared/3d/camera/transitions.ts`
- `src/lib/shared/ui-animation/presets.ts`
- `src/lib/features/learn/domain/constants/motion-visualizer-data.ts`
- `src/lib/shared/sequence-viewer/utils/format-time.ts`
- `src/lib/features/learn/quiz/quiz-results-analyzer.ts`
- `src/lib/features/write/domain/types/write.ts`

Files modified (Phase 3, local definitions):
- `src/lib/features/lab/tabs/collision-lab/services/implementations/StanceOptimizer.ts`
- `src/lib/features/museum/state/museum-state.svelte.ts`
- `src/lib/shared/animation-engine/domain/types/FireTypes.ts`
- `src/lib/shared/animation-engine/domain/types/CharcoalSparkTypes.ts`
- `src/lib/shared/3d/services/implementations/StageSceneAdapter.ts`
- `src/lib/shared/3d/procedural-engine/generation/seed-generator.ts`
- `src/lib/shared/animation-engine/domain/patterns/tka-aware.ts`
- `src/lib/shared/render-graph/translators/TrailTranslator.ts`
- `src/lib/features/assemble-lab/services/timing-interpreter.ts`

Files modified (Phase 4, word-simplifier):
- `src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte`
- `tests/unit/utils/word-simplifier.test.ts`

Files deleted:
- `src/lib/features/create/shared/workspace-panel/shared/utils/word-simplifier.ts`

Total: 2 new, ~20 modified, 1 deleted.
