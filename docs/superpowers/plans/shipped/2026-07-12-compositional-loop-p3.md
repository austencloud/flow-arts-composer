# Compositional LOOP System — P3 (Rhythm UI + Representation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose any v1 LOOP realization from the combo overlay (rotation interval, inversion interval + overlay mode), see what it means (word-math line + block timeline), and read it back everywhere (overlay-dot in the shared icon strip).

**Architecture:** A collapsed "Rhythm" tier inside `LOOPExpandedOverlay` (combo mode) writes `period`/`inversionInterval`/`inversionMode` to `UIGenerationConfig` through a new `onRhythmChange` prop threaded via `LOOPDrawer` ← `GeneratePanel` (which owns `configState`). A pure `blockSignatures()` function derives per-block transform signatures from a wire spec; `LoopBlockTimeline` renders it. The overlay-dot lands once in `@tka/render-composition/loop-icons` (shared by the Svelte strip and the export canvas renderer). Spec: `docs/superpowers/specs/2026-07-12-compositional-loop-spec-design.md` (P3 section). P1+P2 plan (done): `docs/superpowers/plans/2026-07-12-compositional-loop-p1-p2.md`.

**Execution rules (every task):** identical to the P1+P2 plan — re-read plan at task start; explicit-pathspec commits only; prove with tool output; trailers:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
`Claude-Session: https://claude.ai/code/session_01LyTZ3ZYsAdJGH6ibqSnjEj`

**UI rules that bind here:** SegmentedControl for every exactly-one-active choice (chip-primitives); NO `<input type="checkbox">` (no-checkboxes); reserve worst-case width for changing text, `tabular-nums` for numbers (no-layout-shift); plain language copy, no jargon-first labels (writing guide); 44px touch targets.

---

## Verified wiring facts (from recon — do not re-derive)

- `LOOPExpandedOverlay.svelte` props: `{ currentType, selectedComponents, onChange(loopType), onClose, onLoopDisable?, layout? }`. Combo apply = `handleConfirm` → `applyAndClose()` → `generateLOOPType(localSelectedComponents)` → `onChange(newLoopType)`. Gating: `isImplemented`, `disabledComponents` via `canExtendCombo`. The overlay has NO length/period knowledge today.
- Render site: `components/modals/LOOPDrawer.svelte` (lines ~42-51), reading `panelState.loopCurrentType/loopSelectedComponents/loopOnChange`; `LOOPDrawer` is mounted in `GeneratePanel.svelte` (~lines 232-242), which has `configState` in scope (it already wires `onLoopDisable` → `configState.updateConfig({ loopEnabled: false })`).
- `UIGenerationConfig` (in `src/lib/shared/create/utils/config-mapper.ts`, lines ~62-88) ALREADY has `inversionInterval?: 2 | 4` and `inversionMode?: "expand" | "overlay"`; `uiConfigToGenerationOptions` already consumes them via `buildLoopSpec`. Rotation interval = the existing `period` field (`Period.HALVED`/`QUARTERED`).
- Helpers (P2): `buildLoopSpec(components, rhythm)`, `expanderMultiplier(wire)`, `specHasExpandInversion(wire)` in `src/lib/shared/create/services/loop-type-utils.ts`.
- `SegmentedControl` (`src/lib/shared/3d/components/controls/SegmentedControl.svelte`): generic `T extends string`; `options: {value, label, icon?, count?, disabled?}[]`, `value`, `onchange`, `color?: "blue"|"red"|"accent"`, `size?: "sm"|"md"`. The overlay already uses it for Single/Combo.
- Icon strips: app `src/lib/shared/components/LOOPIconStrip.svelte` and export `packages/render-composition/src/loop-icons.ts` (`renderLoopIconStrip`, `DISPLAY_ORDER` line ~18) share order `[rotated, mirrored, flipped, swapped, inverted, rewound]` — already innermost-first per the canonical law. Export header calls it from `packages/render-composition/src/header-renderer.ts` (~lines 271-281). `src/lib/shared/render/services/loop-icon-strip-renderer.ts` is orphaned (no callers) — do not extend it.
- Strip consumers (both pass rotationPeriod + inversionPeriod): `WordHeader.svelte` (~302-308), `CardHeader.svelte` (~109-114).
- Display resolver (P2): `resolveLoopDisplay` returns `{ components, componentDomains, period, rotationPeriod, inversionPeriod }`; overlay components get `componentDomains[comp] === "orientation"`.

---

### Task 1: `blockSignatures()` — pure block-timeline derivation

**Files:**
- Create: `src/lib/shared/create/services/loop-block-signatures.ts`
- Test: `tests/unit/services/loop-block-signatures.test.ts`

The function mirrors the engine's stage semantics (same rules as `expanderMultiplier` — read its doc comment in `loop-type-utils.ts`) to produce per-block transform signatures for display.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { blockSignatures } from "$lib/shared/create/services/loop-block-signatures";
import type { LOOPSpecWire } from "@tka/sequence-engine/loop";

const wire = (prop: Record<string, { period: number; mode?: "expand" | "overlay" }>): LOOPSpecWire =>
  ({ blue: prop, red: prop }) as LOOPSpecWire;

const sigs = (cells: Array<Set<string>>) => cells.map((c) => [...c].sort().join("+") || "base");

describe("blockSignatures", () => {
  it("halved MIR (rot:2, mir:2, inv:2): two cells — base | mirror+invert", () => {
    const r = blockSignatures(wire({ rotated: { period: 2 }, mirrored: { period: 2 }, inverted: { period: 2 } }));
    expect(sigs(r.cells)).toEqual(["base", "inverted+mirrored"]);
    expect(r.rotation).toEqual({ interval: 2 });
  });

  it("full triple with expand inv:4 (rot:2, mir:2, inv:4): 8 cells, mirror inner, inversion alternating", () => {
    const r = blockSignatures(wire({ rotated: { period: 2 }, mirrored: { period: 2 }, inverted: { period: 4 } }));
    expect(sigs(r.cells)).toEqual([
      "base", "mirrored", "inverted", "inverted+mirrored",
      "base", "mirrored", "inverted", "inverted+mirrored",
    ]);
  });

  it("overlay inversion (rot:2, mir:2, inv:4 overlay): 4 cells — base | inv | mirror | mirror+inv", () => {
    const r = blockSignatures(wire({ rotated: { period: 2 }, mirrored: { period: 2 }, inverted: { period: 4, mode: "overlay" } }));
    expect(sigs(r.cells)).toEqual(["base", "inverted", "mirrored", "inverted+mirrored"]);
  });

  it("fused quarter-toggle (mir:4, inv:4): 4 cells alternating", () => {
    const r = blockSignatures(wire({ mirrored: { period: 4 }, inverted: { period: 4 } }));
    expect(sigs(r.cells)).toEqual(["base", "inverted+mirrored", "base", "inverted+mirrored"]);
    expect(r.rotation).toBeUndefined();
  });

  it("rotation absorbed into fused stage still reports the ribbon (rot:2 + inv:2, no mirror)", () => {
    const r = blockSignatures(wire({ rotated: { period: 2 }, inverted: { period: 2 } }));
    // one fused stage x2: cells [base, inverted]; rotation ribbon still shown
    expect(sigs(r.cells)).toEqual(["base", "inverted"]);
    expect(r.rotation).toEqual({ interval: 2 });
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/services/loop-block-signatures.test.ts --config tests/config/vitest.config.ts`
Expected: FAIL — module missing.

- [x] **Step 3: Implement**

```ts
/**
 * Per-block transform signatures for the LOOP block timeline.
 *
 * Mirrors the engine's canonical stage semantics (spec-executor.ts):
 * fused expand-groups (mirror/flip/swap-containing before invert-only,
 * ascending period; same-period components share ONE group), then overlay
 * components partition the final sequence. Rotation is continuous/innermost
 * and is reported as a ribbon, not a per-cell signature.
 */
import type { LOOPSpecWire } from "@tka/sequence-engine/loop";

export interface BlockTimelineModel {
  /** One Set of component ids per display cell, in sequence order. */
  cells: Array<Set<string>>;
  /** Present when the spec rotates (expand mode). */
  rotation?: { interval: number };
}

const FUSEABLE = ["mirrored", "flipped", "swapped", "inverted"] as const;

export function blockSignatures(wire: LOOPSpecWire): BlockTimelineModel {
  const prop = wire.blue ?? wire.red;
  if (!prop) return { cells: [new Set()] };

  // Group expand-mode fuseables by period (same rule as expanderMultiplier).
  const groups = new Map<number, Set<string>>();
  for (const comp of FUSEABLE) {
    const cSpec = prop[comp];
    if (!cSpec || cSpec.mode === "overlay") continue;
    const g = groups.get(cSpec.period) ?? new Set<string>();
    g.add(comp);
    groups.set(cSpec.period, g);
  }

  // Canonical order: mirror/flip/swap-containing groups first, invert-only last;
  // ascending period within each class.
  const ordered = [...groups.entries()].sort(([pa, ca], [pb, cb]) => {
    const invOnlyA = ca.has("inverted") && ca.size === 1 ? 1 : 0;
    const invOnlyB = cb.has("inverted") && cb.size === 1 ? 1 : 0;
    if (invOnlyA !== invOnlyB) return invOnlyA - invOnlyB;
    return pa - pb;
  });

  let cells: Array<Set<string>> = [new Set()];
  for (const [period, comps] of ordered) {
    const next: Array<Set<string>> = [];
    for (let rep = 0; rep < period; rep++) {
      for (const cell of cells) {
        const copy = new Set(cell);
        if (rep % 2 === 1) for (const c of comps) copy.add(c);
        next.push(copy);
      }
    }
    cells = next;
  }

  // Overlay components partition the FINAL sequence into `period` blocks.
  for (const comp of FUSEABLE) {
    const cSpec = prop[comp];
    if (!cSpec || cSpec.mode !== "overlay") continue;
    const p = cSpec.period;
    const n = lcm(cells.length, p);
    if (n !== cells.length) {
      const scale = n / cells.length;
      cells = cells.flatMap((cell) => Array.from({ length: scale }, () => new Set(cell)));
    }
    const blockSize = cells.length / p;
    cells = cells.map((cell, i) => {
      if (Math.floor(i / blockSize) % 2 === 1) {
        const copy = new Set(cell);
        copy.add(comp);
        return copy;
      }
      return cell;
    });
  }

  const rot = prop.rotated;
  return {
    cells,
    ...(rot && rot.mode !== "overlay" ? { rotation: { interval: rot.period } } : {}),
  };
}

function lcm(a: number, b: number): number {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  return (a * b) / gcd(a, b);
}
```

- [x] **Step 4: Run tests** — all 5 PASS.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(create): blockSignatures — per-block transform signatures for the LOOP timeline" -- src/lib/shared/create/services/loop-block-signatures.ts tests/unit/services/loop-block-signatures.test.ts
```

---

### Task 2: `LoopBlockTimeline` component

**Files:**
- Create: `src/lib/shared/components/LoopBlockTimeline.svelte`
- No test (presentational; component-test discipline says test-on-fix, not on-create).

Renders `BlockTimelineModel`: a fixed-height row of equal-width cells; each cell shows tiny FontAwesome icons for its signature components (colors from the icon-strip palette — copy the hex values used in `LOOPIconStrip.svelte`'s `primitiveIcons`: mirrored `#6F2DA8`, flipped `#e91e63`, swapped `#2ecc71`, inverted `#eb7d00`); base cells show a faint neutral dot. When `rotation` is present, a thin continuous ribbon (accent `#36c3ff`, arrow glyph at the end) runs under the cells with a caption slot for the interval.

- [x] **Step 1: Implement**

```svelte
<!--
  LoopBlockTimeline — the novice bridge for compositional LOOPs.
  Shows what each stretch of the sequence DOES relative to the first block,
  without terminology: equal cells, per-cell transform icons, and a
  continuous rotation ribbon underneath when the loop rotates.
  Cells are equal-width by construction (grid), so signature changes can
  never shift layout.
-->
<script lang="ts">
  import type { BlockTimelineModel } from "$lib/shared/create/services/loop-block-signatures";

  let { model, height = 34 }: { model: BlockTimelineModel; height?: number } = $props();

  const ICONS: Record<string, { fa: string; color: string; label: string }> = {
    mirrored: { fa: "fas fa-left-right", color: "#6F2DA8", label: "Mirrored" },
    flipped: { fa: "fas fa-up-down", color: "#e91e63", label: "Flipped" },
    swapped: { fa: "fas fa-shuffle", color: "#2ecc71", label: "Swapped" },
    inverted: { fa: "fas fa-adjust", color: "#eb7d00", label: "Inverted" },
  };
</script>

<div class="timeline" style="--cells: {model.cells.length}; --h: {height}px;">
  <div class="cells" role="img" aria-label="Loop structure timeline">
    {#each model.cells as cell, i (i)}
      <div class="cell" class:base={cell.size === 0}>
        {#if cell.size === 0}
          <span class="base-dot" aria-hidden="true"></span>
        {:else}
          {#each [...cell].sort() as comp (comp)}
            {#if ICONS[comp]}
              <i class={ICONS[comp].fa} style="color: {ICONS[comp].color}" title={ICONS[comp].label}></i>
            {/if}
          {/each}
        {/if}
      </div>
    {/each}
  </div>
  {#if model.rotation}
    <div class="ribbon" title="Rotates continuously ({model.rotation.interval === 4 ? 'quarter turns' : 'half turns'})">
      <span class="ribbon-line"></span>
      <i class="fas fa-rotate" aria-hidden="true"></i>
    </div>
  {/if}
</div>

<style>
  .timeline { display: flex; flex-direction: column; gap: 3px; width: 100%; }
  .cells {
    display: grid;
    grid-template-columns: repeat(var(--cells), 1fr);
    gap: 3px;
    height: var(--h);
  }
  .cell {
    display: flex; align-items: center; justify-content: center; gap: 4px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: calc(var(--h) * 0.42);
    min-width: 0;
  }
  .cell.base { background: rgba(255, 255, 255, 0.03); }
  .base-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: currentColor; opacity: 0.35;
  }
  .ribbon { display: flex; align-items: center; gap: 5px; color: #36c3ff; font-size: 10px; }
  .ribbon-line {
    flex: 1; height: 2px; border-radius: 2px;
    background: linear-gradient(90deg, transparent, #36c3ff 15%, #36c3ff);
    opacity: 0.7;
  }
</style>
```

- [x] **Step 2: Verify it compiles** — `npm run check:fast` (report the "No problems found" line; ignore its known converter noise).

- [x] **Step 3: Commit**

```bash
git commit -m "feat(shared): LoopBlockTimeline — block-signature strip with rotation ribbon" -- src/lib/shared/components/LoopBlockTimeline.svelte
```

---

### Task 3: Rhythm tier in the combo overlay + plumbing

**Files:**
- Modify: `src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte`
- Modify: `src/lib/features/create/generate/components/modals/LOOPDrawer.svelte`
- Modify: `src/lib/features/create/generate/components/GeneratePanel.svelte`
- Test: `tests/unit/services/loop-rhythm-gating.test.ts` (create — pure gating logic extracted so it's testable without a browser)

**Design (follow exactly):**

1. **New props on `LOOPExpandedOverlay`:**

```ts
/** Current rhythm + context for the Rhythm tier. All optional — absent = tier hidden (legacy callers unaffected). */
rhythm?: { rotationInterval: 2 | 4; inversionInterval: 2 | 4; inversionMode: "expand" | "overlay" };
sequenceLength?: number;
onRhythmChange?: (updates: Partial<{ rotationInterval: 2 | 4; inversionInterval: 2 | 4; inversionMode: "expand" | "overlay" }>) => void;
```

Local `$state` mirrors (`localRhythm`), synced from the prop like `localSelectedComponents`. Rhythm changes are LOCAL until Apply; `applyAndClose()` fires `onRhythmChange(localRhythm-diff)` BEFORE `onChange(newLoopType)` (config-mapper reads both on next generate).

2. **Rhythm disclosure** (combo mode only, rendered below the component grid, collapsed by default behind a small `<button>` "Rhythm" with chevron — real button, 44px target):
   - **Rotation row** (visible when `rotated` selected): label "Rotation" + `SegmentedControl` size="sm" options `[{value:"2", label:"Half turns"}, {value:"4", label:"Quarter turns"}]`.
   - **Inversion rows** (visible when `inverted` selected): label "Inversion" + `SegmentedControl` `[{value:"2", label:"At the half"}, {value:"4", label:"Every quarter"}]`, then mode `SegmentedControl` `[{value:"expand", label:"Adds length"}, {value:"overlay", label:"On top"}]`.
   - **Caption line** under the mode control, plain language, one sentence per state:
     - expand: `"The inverted half is added to the sequence."` / quarters: `"Inverted blocks are added, alternating every quarter."`
     - overlay halves: `"Same hand positions — props flip spin direction for the second half."`
     - overlay quarters: `"Same hand positions — props flip spin direction every quarter."`
     Caption element uses a ghost-sizer or fixed min-height for its longest variant (no-layout-shift).
3. **Word-math line** (always visible in combo mode when a spec is buildable): built from `buildLoopSpec(localSelectedComponents, localRhythm)` + `expanderMultiplier`:
   - divisible: `` `${seed} letters × ${multiplier} = ${sequenceLength} beats` `` plus `" · inversion on top"` when overlay. `font-variant-numeric: tabular-nums`.
   - not divisible: `` `${sequenceLength} beats can't split into ${multiplier} equal parts` ``.
4. **Block timeline**: render `<LoopBlockTimeline model={blockSignatures(specWire)} />` under the word-math line when a spec is buildable.
5. **Gating extension**: extract a pure helper into `src/lib/shared/create/services/loop-rhythm-gating.ts`:

```ts
import type { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { buildLoopSpec, expanderMultiplier, specHasExpandInversion, type LoopRhythm } from "./loop-type-utils";

export type RhythmGate =
  | { ok: true; seedLength: number; multiplier: number }
  | { ok: false; reason: string };

export function gateRhythm(
  components: Set<LOOPComponent>,
  rhythm: LoopRhythm,
  sequenceLength: number,
): RhythmGate {
  const wire = buildLoopSpec(components, rhythm);
  if (!wire) return { ok: false, reason: "No LOOP type matches this exact combination" };
  const multiplier = expanderMultiplier(wire);
  if (sequenceLength % multiplier !== 0) {
    return { ok: false, reason: `${sequenceLength} beats can't split into ${multiplier} equal parts` };
  }
  const seedLength = sequenceLength / multiplier;
  if (seedLength < 2 && specHasExpandInversion(wire)) {
    return { ok: false, reason: "Too short — a one-beat seed has nothing for inversion to flip" };
  }
  return { ok: true, seedLength, multiplier };
}
```

   Apply button disabled when `!gate.ok` (in addition to the existing `isImplemented` gate); reason shown in the existing badge slot. When `sequenceLength` is undefined (legacy callers), skip the length checks — behave exactly as today.
6. **Plumbing:** `GeneratePanel.svelte` passes to `LOOPDrawer` → overlay:
   - `rhythm={{ rotationInterval: configState.config.period === Period.QUARTERED ? 4 : 2, inversionInterval: configState.config.inversionInterval ?? 2, inversionMode: configState.config.inversionMode ?? "expand" }}`
   - `sequenceLength={configState.config.length}`
   - `onRhythmChange={(u) => configState.updateConfig({ ...(u.rotationInterval ? { period: u.rotationInterval === 4 ? Period.QUARTERED : Period.HALVED } : {}), ...(u.inversionInterval ? { inversionInterval: u.inversionInterval } : {}), ...(u.inversionMode ? { inversionMode: u.inversionMode } : {}) })}`
   (match `GeneratePanel`'s actual config-state accessor names — read the file; `onLoopDisable` wiring shows the pattern.)

- [x] **Step 1: Write the failing gating test** (`tests/unit/services/loop-rhythm-gating.test.ts`): cases — valid halved MIR at 16 (ok, seed 4, mult 4); MIR at 18 (not divisible); rotated+inverted expand at length equal to multiplier (seed 1 → too short); overlay inversion never affects divisibility (rot:2+mir:2+inv overlay@4 at 16 → ok, seed 4, mult 4); unmapped combo → reason string.
- [x] **Step 2: Run to verify failure.**
- [x] **Step 3: Implement** `loop-rhythm-gating.ts`, then the overlay tier, then the plumbing (read each file first; the overlay's existing structure/style conventions are the template — extend, don't restructure).
- [x] **Step 4: Run** the gating test + `npx vitest run tests/unit/services --config tests/config/vitest.config.ts` (all green) + `npm run check:fast` (no problems).
- [x] **Step 5: Grep-proof the UI rules:** `grep -n "type=\"checkbox\"" src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte` (must be empty); confirm SegmentedControl used for all three choices.
- [x] **Step 6: Commit**

```bash
git commit -m "feat(generate): Rhythm tier — rotation/inversion intervals, overlay mode, word math, block timeline" -- src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte src/lib/features/create/generate/components/modals/LOOPDrawer.svelte src/lib/features/create/generate/components/GeneratePanel.svelte src/lib/shared/create/services/loop-rhythm-gating.ts tests/unit/services/loop-rhythm-gating.test.ts
```

---

### Task 4: Overlay-dot in the shared icon strip (app + export)

**Files:**
- Modify: `packages/render-composition/src/loop-icons.ts` (`renderLoopIconStrip` gains `overlayComponents?: Set<string>`)
- Modify: `packages/render-composition/src/header-renderer.ts` (`HeaderOptions.overlayComponents?`, pass through; widen the strip-width math for the dot)
- Modify: `src/lib/shared/components/LOOPIconStrip.svelte` (`overlayComponents?: Set<LOOPComponent>` prop → faded dot before the first overlaid icon, same visual as the word display's group-dot: currentColor, opacity 0.4, ~0.15em)
- Modify: `src/lib/features/loop-labeler/services/loop-display-resolver.ts` (`LoopDisplay` gains `overlayComponents?: Set<LOOPComponent>`, populated in the spec branch from `cSpec.mode === "overlay"`)
- Modify: `src/lib/shared/sequence-viewer/components/CardHeader.svelte` + `src/lib/shared/animation-engine/components/layers/WordHeader.svelte` (pass `overlayComponents` through — trace where each gets its loop props from `resolveLoopDisplay` and extend the same path)
- Test: extend `tests/unit/loop/loop-display-resolver-spec.test.ts` (resolver returns overlayComponents)

Semantics: icons stay in the existing innermost-first `DISPLAY_ORDER`; components whose mode is overlay render LAST (after all expand components) separated by one faded dot — same segment grammar as `TKAWordGlyph`/`WordHeader`'s group-dot. When `overlayComponents` is absent/empty, output is pixel-identical to today.

- [x] **Step 1: Failing resolver test** — spec branch input with `inverted: { period: 4, mode: "overlay" }` → `display.overlayComponents` contains INVERTED; input without overlay → `overlayComponents` undefined or empty.
- [x] **Step 2: Verify failure.**
- [x] **Step 3: Implement** resolver + Svelte strip + package renderer + header pass-through + consumer plumbing. For the export path: `renderHeader` callers (`text-renderer.ts`, `canvas-renderer.ts`) receive loop data from their orchestrators — trace each caller's source for loop components; where the source has the sequence's `loopSpec` or `LoopDisplay` available, plumb `overlayComponents`; where it doesn't (worker bundles without the resolver), passing undefined is acceptable and documented with a one-line comment (dot absent = degraded, not wrong).
- [x] **Step 4: Run** resolver tests + `cd packages/sequence-engine && cd ../render-composition && npx vitest run` if that package has tests (check for a vitest config; if none, `npm run build:packages` type-gate suffices) + `npm run build:packages` + `npm run check:fast`.
- [x] **Step 5: Commit**

```bash
git commit -m "feat(loop): overlay components render after a faded dot in the icon strip (app + export)" -- packages/render-composition/src/loop-icons.ts packages/render-composition/src/header-renderer.ts src/lib/shared/components/LOOPIconStrip.svelte src/lib/features/loop-labeler/services/loop-display-resolver.ts src/lib/shared/sequence-viewer/components/CardHeader.svelte src/lib/shared/animation-engine/components/layers/WordHeader.svelte tests/unit/loop/loop-display-resolver-spec.test.ts
```

(Adjust the pathspec to the files actually touched — consumer plumbing may add a file or two; list them explicitly.)

---

### Task 5: Gates

- [x] **Step 1:** `npx vitest run tests/unit/loop tests/unit/services --config tests/config/vitest.config.ts` — report counts (fixture-audit totals must stay PASS=190 PARTIAL=27 EXTRA=1 FAIL=52).
  Actual: 30 files / 182 tests passed; totals `PASS=190 PARTIAL=27 EXTRA=1 FAIL=52` — locked.
- [x] **Step 2:** `cd packages/sequence-engine && npx vitest run` — 282+ green.
  Actual: 36 files / 282 tests passed.
- [x] **Step 3:** ONE full `npm run check > check-p3.log 2>&1; grep -iE "svelte-check found" check-p3.log` — report the summary line (1 pre-existing OptionPulsePreview error is known/out-of-scope; anything else must be fixed).
  Actual: `svelte-check found 0 errors and 0 warnings` (the OptionPulsePreview error was fixed by its owning session in the interim).
- [x] **Step 4:** `npm run build:fast` — succeeds.
  Actual: exit 0.
- [x] **Step 5:** Commit the plan file alone: `docs(plan): compositional LOOP P3 gates green`.

---

## Deferred (explicitly NOT P3)

- Detection completeness (P4).
- Gallery presets incl. variant D quarter-toggle mirror (P5) — note D IS reachable via blockSignatures/timeline already, but no UI path constructs mir@4.
- Card-back / guide reuse of LoopBlockTimeline.
- Visual browser verification — after gates, ask Austen to check the Rhythm tier at [localhost:5173/create/generate](https://localhost:5173/create/generate) (combo mode → Rhythm).
