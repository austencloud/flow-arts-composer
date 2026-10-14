# Shape Matrix Elemental Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-thumbnail drill on `/notation/shape-matrix` with an elemental drill: six element-styled VTG mode chips over a hero stage where the clicked mandala renders still, then gets traced live by trailing props when an element is picked.

**Architecture:** A lean realization builder (no PNG card bakes) feeds a reworked `ShapeMatrixDrill` — one stable screen: `ElementChipRow` (six bespoke chips) + a hero stage stacking a static engine-aligned `MandalaHeroLayer` canvas under `InlineAnimationPlayer` (vivid trails via the existing `trailSettingsOverride` prop) + a reserved caption line. Spec: `docs/superpowers/specs/2026-07-19-shape-matrix-elemental-drill-design.md` — READ IT FIRST.

**Tech Stack:** Svelte 5 runes, vitest, existing animation engine + mandala renderer. No new dependencies.

## Global Constraints

- **NEVER run `npm run check` or `npm run build`** (Austen's standing directive — they crush the machine). Verify with targeted `npx vitest run <file>` and greps only. One full check happens at project end, by the main session, not you.
- Never touch port 5173 (Austen's dev server); never `npm run dev`.
- Commit ONLY with explicit pathspec: `git commit -m "..." -- <paths>`. Never bare commit, never `git add -A` (`commit-only-your-own-changes.md`). Other agents share this checkout — `git pull --rebase` before each commit; leave files you didn't touch alone. End every commit message with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01Q1D6QazPBepociLkYLyabz`
- No em dash (U+2014) in any user-visible text. No `type="checkbox"`. Rotation slices are ratios (1:1/1:3/1:5), never "half turns"/"quarter turns". Sequence words display through `simplifyRepeatedWord`.
- Do NOT mutate `animationSettings` or `getAnimationVisibilityManager()` (global singletons — leaks into the visitor's app). Per-instance props only.
- The mode→element mapping is DIAMOND-GRID-SPECIFIC (opposite-direction elements permute in box mode). The code comment in Task 1 carries this; keep it.
- HMR gotcha: after editing, a full reload can serve a stale compiled component on this machine. If a style/prop change seems missing in the browser, `touch` the file and reload; verify via `document.styleSheets`, not by eye.

## File Structure

- Create: `src/lib/shared/shape-matrix/services/build-mode-realizations.ts` (lean builder)
- Create: `src/lib/shared/shape-matrix/services/mandala-hero.ts` (alignment math + draw)
- Create: `src/lib/shared/shape-matrix/components/MandalaHeroLayer.svelte` (static canvas layer)
- Create: `src/lib/shared/shape-matrix/components/ElementChipRow.svelte` (six chips; chip markup inline — one file, one responsibility: the picker row)
- Rework: `src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte` (new anatomy)
- Modify: `src/routes/(public)/notation/shape-matrix/+page.svelte` (drill always rendered; ghost empty state removed)
- Create: `tests/unit/shape-matrix-elemental-drill.test.ts` (mapping + alignment math)
- Reference (read, do not modify): `build-realization-cards.ts`, `render-mandala-overlay-layer.ts`, `bake-mandala-clips.ts`, `hero-trail-preset.ts`, `mandala-renderer.ts`, `tnd-element.ts`, `InlineAnimationPlayer.svelte`

---

### Task 1: Lean realization builder

**Files:**
- Create: `src/lib/shared/shape-matrix/services/build-mode-realizations.ts`
- Test: `tests/unit/shape-matrix-elemental-drill.test.ts`

**Interfaces:**
- Consumes: `resolveBase`, `loadBaseIndex` from `./build-realization-sequence`; `verifyAndCorrect` from `./verify-realization-parity`; `MODE_ORDER`, `MODE_LABEL`, `VtgMode` from `./shape-matrix-realizations`; `loadDiamondEdges` from `$lib/features/choreo-card/services/pictograph-letter-lookup`; `TND_BY_FAMILY`, `TnDElement` from `$lib/features/choreo-card/domain/tnd-element`; `CellOverlay`, `Flower` types as in `build-realization-cards.ts`.
- Produces: `FAMILY_BY_MODE: Record<VtgMode, string>`, `interface ModeRealization { mode: VtgMode; modeLabel: string; word: string; element: TnDElement; seq: SequenceData }`, `buildModeRealizations(pair, overlay): Promise<ModeRealization[]>`. Task 4 consumes all three.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/shape-matrix-elemental-drill.test.ts
import { describe, it, expect } from "vitest";
import { FAMILY_BY_MODE } from "$lib/shared/shape-matrix/services/build-mode-realizations";
import { MODE_ORDER } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";

describe("elemental drill mode mapping", () => {
  it("maps every VTG mode to a distinct TnD element", () => {
    const elements = MODE_ORDER.map((m) => {
      const family = FAMILY_BY_MODE[m];
      const el = TND_BY_FAMILY[family];
      expect(el, `mode ${m} → family ${family}`).toBeDefined();
      return el.element;
    });
    expect(new Set(elements).size).toBe(6);
    expect(elements).toEqual(["water", "earth", "sun", "fire", "air", "moon"]);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/shape-matrix-elemental-drill.test.ts`
Expected: FAIL (module `build-mode-realizations` not found).

- [x] **Step 3: Write the builder**

```ts
// src/lib/shared/shape-matrix/services/build-mode-realizations.ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { loadDiamondEdges } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { TND_BY_FAMILY, type TnDElement } from "$lib/features/choreo-card/domain/tnd-element";
import { loadBaseIndex, resolveBase } from "./build-realization-sequence";
import { verifyAndCorrect } from "./verify-realization-parity";
import { MODE_ORDER, MODE_LABEL, type VtgMode } from "./shape-matrix-realizations";
import type { CellOverlay } from "./build-realization-cards";
import { type Flower } from "../domain/flower-signature";

/** VTG mode → TnD family id. DIAMOND-GRID ONLY: same-direction elements
 *  (water/earth/sun) are grid-mode invariant, but the opposite-direction trio
 *  permutes in box mode (air/fire ↔ moon). The shape matrix is diamond, so
 *  this static map is valid here — do not reuse it for a box-mode surface. */
export const FAMILY_BY_MODE: Record<VtgMode, string> = {
  SS: "split-same",
  TS: "tog-same",
  QS: "quarter-same",
  SO: "split-opp",
  TO: "tog-opp",
  QO: "quarter-opp",
};

export interface ModeRealization {
  mode: VtgMode;
  modeLabel: string;
  /** Base word, simplified at DISPLAY time (e.g. "AAAA" → shown as "A"). */
  word: string;
  element: TnDElement;
  /** Parity-corrected sequence — feeds the animation player directly. */
  seq: SequenceData;
}

/**
 * The public drill's builder: buildModeCards minus the PNG card bakes (that
 * ~14s cost and its lab bake import stay on the lab QA path). Parity
 * auto-correction still runs; the verdict is not surfaced (QA detail).
 */
export async function buildModeRealizations(
  pair: { blue: Flower; red: Flower },
  overlay: CellOverlay,
): Promise<ModeRealization[]> {
  const [idx, edges] = await Promise.all([loadBaseIndex(), loadDiamondEdges()]);
  const out: ModeRealization[] = [];
  for (const mode of MODE_ORDER) {
    const base = resolveBase(idx, mode, pair.blue.style, pair.red.style);
    if (!base) continue;
    const element = TND_BY_FAMILY[FAMILY_BY_MODE[mode]];
    if (!element) continue;
    try {
      const parity = verifyAndCorrect(base, pair, overlay.blue, overlay.red, edges, overlay.clubTipDx);
      out.push({
        mode,
        modeLabel: MODE_LABEL[mode],
        word: (base.word ?? mode).toUpperCase(),
        element,
        seq: parity.sequence,
      });
    } catch {
      // A mode whose realization cannot be built is dropped, never substituted.
    }
  }
  return out;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/shape-matrix-elemental-drill.test.ts`
Expected: PASS (1 test).

- [x] **Step 5: Commit** (6fa06ba467, pushed)

```bash
git pull --rebase
git commit -m "feat(shape-matrix): lean mode-realization builder for the elemental drill" -- src/lib/shared/shape-matrix/services/build-mode-realizations.ts tests/unit/shape-matrix-elemental-drill.test.ts
```

---

### Task 2: Engine-aligned mandala hero layer

**Files:**
- Create: `src/lib/shared/shape-matrix/services/mandala-hero.ts`
- Create: `src/lib/shared/shape-matrix/components/MandalaHeroLayer.svelte`
- Test: `tests/unit/shape-matrix-elemental-drill.test.ts` (extend)

**Interfaces:**
- Consumes: `renderMandalaToCanvas` from `$lib/shared/mandala/services/mandala-renderer`; `MANDALA_GRID_RADIUS`, `ENGINE_GRID_RADIUS`, `DARK_MOTION_*` constants from `$lib/shared/mandala/domain/mandala-constants`; `MandalaPaths`, `MandalaPalette` from `$lib/shared/mandala/domain/mandala-types`.
- Produces: `alignScale(clubTipDx: number): number`; `drawAlignedMandala(ctx: CanvasRenderingContext2D, paths: MandalaPaths, sizePx: number, opts: { clubTipDx: number; opacity?: number }): void`; `<MandalaHeroLayer paths={MandalaPaths} clubTipDx={number} opacity={number} />` (absolutely-positioned canvas filling its parent square). Task 4 consumes the component.

- [x] **Step 1: Extend the test (failing)**

```ts
// append to tests/unit/shape-matrix-elemental-drill.test.ts
import { alignScale } from "$lib/shared/shape-matrix/services/mandala-hero";
import { MANDALA_GRID_RADIUS, ENGINE_GRID_RADIUS } from "$lib/shared/mandala/domain/mandala-constants";

describe("mandala hero alignment", () => {
  it("matches the bake path's alignment formula (contract with render-mandala-overlay-layer)", () => {
    const clubTipDx = 130;
    const tipReach = (clubTipDx * MANDALA_GRID_RADIUS) / ENGINE_GRID_RADIUS;
    const maxExtent = MANDALA_GRID_RADIUS + tipReach;
    const mandalaHandFrac = MANDALA_GRID_RADIUS / (2 * maxExtent * 1.05);
    const expected = 150 / 950 / mandalaHandFrac;
    expect(alignScale(clubTipDx)).toBeCloseTo(expected, 10);
  });
});
```

- [x] **Step 2: Run to verify it fails** — `npx vitest run tests/unit/shape-matrix-elemental-drill.test.ts` → FAIL (module not found).

- [x] **Step 3: Write the service**

```ts
// src/lib/shared/shape-matrix/services/mandala-hero.ts
import { renderMandalaToCanvas } from "$lib/shared/mandala/services/mandala-renderer";
import { MANDALA_GRID_RADIUS, ENGINE_GRID_RADIUS } from "$lib/shared/mandala/domain/mandala-constants";
import type { MandalaPaths, MandalaPalette } from "$lib/shared/mandala/domain/mandala-types";
import {
  DARK_MOTION_BLUE_STROKE, DARK_MOTION_BLUE_FILL,
  DARK_MOTION_RED_STROKE, DARK_MOTION_RED_FILL,
  DARK_MOTION_PURPLE_STROKE, DARK_MOTION_PURPLE_FILL,
} from "$lib/shared/mandala/domain/mandala-constants";

const DARK_PALETTE: MandalaPalette = {
  blueStroke: DARK_MOTION_BLUE_STROKE, blueFill: DARK_MOTION_BLUE_FILL,
  redStroke: DARK_MOTION_RED_STROKE, redFill: DARK_MOTION_RED_FILL,
  purpleStroke: DARK_MOTION_PURPLE_STROKE, purpleFill: DARK_MOTION_PURPLE_FILL,
};

/**
 * Scale the mandala's hand circle to the engine hand orbit (150/950 viewbox)
 * so a mandala drawn in the same square as AnimatorCanvas lands exactly under
 * the prop's traced path. Same formula as the lab's
 * render-mandala-overlay-layer.ts (the MP4 bake proves the correspondence);
 * kept in sync by the contract test in shape-matrix-elemental-drill.test.ts.
 */
export function alignScale(clubTipDx: number): number {
  const GRID_HALFWAY = 150;
  const VIEWBOX = 950;
  const tipReach = (clubTipDx * MANDALA_GRID_RADIUS) / ENGINE_GRID_RADIUS;
  const maxExtent = MANDALA_GRID_RADIUS + tipReach;
  const mandalaHandFrac = MANDALA_GRID_RADIUS / (2 * maxExtent * 1.05);
  const engineHandFrac = GRID_HALFWAY / VIEWBOX;
  return engineHandFrac / mandalaHandFrac;
}

/** Paint both hands' loci, engine-aligned, into a square sizePx canvas ctx. */
export function drawAlignedMandala(
  ctx: CanvasRenderingContext2D,
  paths: MandalaPaths,
  sizePx: number,
  opts: { clubTipDx: number; opacity?: number },
): void {
  const { clubTipDx, opacity = 1 } = opts;
  const s = alignScale(clubTipDx);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(sizePx / 2, sizePx / 2);
  ctx.scale(s, s);
  ctx.translate(-sizePx / 2, -sizePx / 2);
  renderMandalaToCanvas(ctx, paths, {
    size: sizePx,
    style: "stroke",
    show: "both",
    tipDx: clubTipDx,
    palette: DARK_PALETTE,
    offsetX: 0,
    offsetY: 0,
    glow: { blur: Math.max(2, sizePx * 0.012) },
  });
  ctx.restore();
}
```

- [x] **Step 4: Run to verify it passes** — `npx vitest run tests/unit/shape-matrix-elemental-drill.test.ts` → PASS (2 tests).

- [x] **Step 5: Write the component**

```svelte
<!-- src/lib/shared/shape-matrix/components/MandalaHeroLayer.svelte
  Static engine-aligned mandala canvas. Fills its parent (which must be the
  SAME square AnimatorCanvas renders into — that shared frame is the whole
  alignment contract). Opacity animates via CSS so the still-mandala → ghost
  transition never re-rasterizes. -->
<script lang="ts">
  import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
  import { drawAlignedMandala } from "../services/mandala-hero";

  let { paths, clubTipDx, opacity = 1 }: {
    paths: MandalaPaths; clubTipDx: number; opacity?: number;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let box = $state<HTMLDivElement | null>(null);

  $effect(() => {
    const el = canvas, host = box;
    const p = paths; // reactive dep: redraw when the cell changes
    if (!el || !host) return;
    const draw = () => {
      const sizeCss = Math.min(host.clientWidth, host.clientHeight);
      const dpr = window.devicePixelRatio || 1;
      const sizePx = Math.max(1, Math.round(sizeCss * dpr));
      el.width = sizePx;
      el.height = sizePx;
      el.style.width = `${sizeCss}px`;
      el.style.height = `${sizeCss}px`;
      const ctx = el.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, sizePx, sizePx);
        drawAlignedMandala(ctx, p, sizePx, { clubTipDx });
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  });
</script>

<div class="mandala-layer" bind:this={box} style="opacity: {opacity}" aria-hidden="true">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .mandala-layer {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    transition: opacity 400ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .mandala-layer { transition: none; }
  }
</style>
```

- [x] **Step 6: Commit** (cbab93d31e, pushed)

```bash
git pull --rebase
git commit -m "feat(shape-matrix): engine-aligned mandala hero layer" -- src/lib/shared/shape-matrix/services/mandala-hero.ts src/lib/shared/shape-matrix/components/MandalaHeroLayer.svelte tests/unit/shape-matrix-elemental-drill.test.ts
```

---

### Task 3: Element chip row

**Files:**
- Create: `src/lib/shared/shape-matrix/components/ElementChipRow.svelte`

**Interfaces:**
- Consumes: `MODE_ORDER`, `VtgMode` from the services; `TND_BY_FAMILY` + `FAMILY_BY_MODE` (Task 1).
- Produces: `<ElementChipRow selected={VtgMode | null} disabled={boolean} onpick={(mode: VtgMode | null) => void} />`. Clicking the active chip calls `onpick(null)` (deselect). Task 4 consumes.

- [x] **Step 1: Write the component**

Bespoke, NOT `FilterChipBase`/`SegmentedControl` — per the `chip-primitives.md` carve-out: per-option element colors + icon PNGs + stacked layout + a none-selected state SegmentedControl cannot represent. Cite the rule in the component comment exactly as below.

```svelte
<!-- src/lib/shared/shape-matrix/components/ElementChipRow.svelte
  The six VTG timing-and-direction modes as elemental pickers. Bespoke rather
  than FilterChipBase/SegmentedControl per chip-primitives.md's keep-separate
  carve-out: per-option element accent colors + icon PNGs + stacked
  icon/code/name layout, plus an at-most-one selection that clears on re-click
  (SegmentedControl cannot represent none-selected). Mode → element mapping is
  diamond-grid-specific (see build-mode-realizations.ts). -->
<script lang="ts">
  import { MODE_ORDER, MODE_LABEL, type VtgMode } from "../services/shape-matrix-realizations";
  import { FAMILY_BY_MODE } from "../services/build-mode-realizations";
  import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";

  let { selected, disabled = false, onpick }: {
    selected: VtgMode | null;
    disabled?: boolean;
    onpick: (mode: VtgMode | null) => void;
  } = $props();

  const chips = MODE_ORDER.map((mode) => ({
    mode,
    label: MODE_LABEL[mode],
    el: TND_BY_FAMILY[FAMILY_BY_MODE[mode]],
  }));

  function elementName(raw: string): string {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
</script>

<div class="chip-row" role="group" aria-label="Timing and direction elements">
  {#each chips as c (c.mode)}
    <button
      type="button"
      class="element-chip"
      class:active={selected === c.mode}
      style="--el: {c.el.accentColor}; --el-dark: {c.el.darkComplement}"
      aria-pressed={selected === c.mode}
      aria-label={`${elementName(c.el.element)} (${c.label})`}
      {disabled}
      onclick={() => onpick(selected === c.mode ? null : c.mode)}
    >
      <img class="chip-icon" src={c.el.iconPath} alt="" />
      <span class="chip-code">{c.mode}</span>
      <span class="chip-name">{elementName(c.el.element)}</span>
    </button>
  {/each}
</div>

<style>
  .chip-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.55rem;
  }
  @media (max-width: 479.98px) {
    .chip-row { grid-template-columns: repeat(3, 1fr); }
  }
  .element-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-height: 44px;
    padding: 0.55rem 0.2rem 0.5rem;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--el) 45%, transparent);
    background: color-mix(in srgb, var(--el) 7%, transparent);
    color: oklch(0.88 0.02 270);
    font-family: inherit;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
  }
  .element-chip:hover:not(:disabled) {
    background: color-mix(in srgb, var(--el) 15%, transparent);
    transform: translateY(-1px);
  }
  .element-chip.active {
    background: color-mix(in srgb, var(--el) 26%, transparent);
    border-color: var(--el);
    box-shadow: 0 0 14px color-mix(in srgb, var(--el) 35%, transparent);
  }
  .element-chip:disabled {
    opacity: 0.38;
    cursor: default;
  }
  .element-chip:focus-visible {
    outline: 2px solid var(--el);
    outline-offset: 2px;
  }
  .chip-icon { width: 26px; height: 26px; object-fit: contain; }
  .chip-code {
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.07em;
    color: color-mix(in srgb, var(--el) 80%, white);
  }
  .chip-name { font-size: 0.68rem; color: oklch(0.66 0.015 270); }
  @media (prefers-reduced-motion: reduce) {
    .element-chip { transition: none; }
    .element-chip:hover:not(:disabled) { transform: none; }
  }
</style>
```

- [x] **Step 2: Commit** (5783f8d950, pushed)

```bash
git pull --rebase
git commit -m "feat(shape-matrix): elemental mode chip row" -- src/lib/shared/shape-matrix/components/ElementChipRow.svelte
```

---

### Task 4: Rework ShapeMatrixDrill + route wiring

**Files:**
- Rework: `src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte` (replace mode-grid/back-button/two-screen internals entirely)
- Modify: `src/routes/(public)/notation/shape-matrix/+page.svelte` (drill always rendered; ghost empty state + its CSS removed)

**Interfaces:**
- Consumes: Tasks 1–3 outputs; `HERO_TRAIL_PRESET` from `$lib/shared/landing/data/hero-trail-preset.ts`; `LazyMount`, `simplifyRepeatedWord`, `flowerKey`, `flowerLabel` as in the current drill; `InlineAnimationPlayer` props `{ sequence, autoPlay, chrome: "minimal", fill: true, beatIndicators: false, bluePropType: "club", redPropType: "club", trailSettingsOverride: HERO_TRAIL_PRESET }`.
- Produces: `<ShapeMatrixDrill pair={{blue,red} | null} data={ShapeMatrixData} />` — pair is now NULLABLE; the drill owns its own empty state.

Behavior contract (from the spec — implement exactly):
1. `pair === null` → chips disabled, hero shows "Pick a cell" hint, caption line reserved but empty.
2. Cell selected, `selectedMode === null` → `MandalaHeroLayer` at opacity 1, no player mounted, caption shows `Blue {flowerLabel(blue)} over red {flowerLabel(red)}` (the pair identity).
3. Mode picked → `buildModeRealizations` result for that mode feeds the player; mandala layer drops to opacity 0.55; caption shows `{Element} · {TnD name} · {simplifyRepeatedWord(word)}` (e.g. `Water · Split-Same · A`).
4. Re-click active chip → `selectedMode = null`, back to state 2.
5. New pair while a mode is active → rebuild realizations, keep `selectedMode` (sticky), player gets the new mode's seq.
6. Realizations build failure → caption-line error text ("Could not build this realization. Reload and try again."), console.error the cause, chips stay usable.

Implementation notes (the parts with sharp edges):
- Build all six realizations eagerly on pair change (they are cheap now); cache keyed by `flowerKey(blue)|flowerKey(red)`; guard stale async with a `cancelled` flag exactly like the current drill's `$effect`.
- The hero stage is a centered SQUARE (the alignment contract): `.hero-stage { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; }` wrapping `.hero-square { position: relative; aspect-ratio: 1 / 1; height: min(100%, 100cqw); }` — put `container-type: size` on `.hero-stage` so `cqw`/`cqh` resolve, or compute the square with a ResizeObserver if container queries fight the drawer-era CSS; verify the square actually is square in the browser (memory: container-query zero-width trap — prove with live geometry, not markup).
- `MandalaHeroLayer` and the `LazyMount`ed player are both `position: absolute; inset: 0` children of `.hero-square`. Player only mounts when a mode is picked (state 3); keep `{#key selectedMode + pairKey}` around the player so mode switches remount cleanly (sequences are different objects; the player's internal hot-swap is for prop types, not sequence identity), or verify the player's `sequence` prop reacts to changes — whichever you verify, say so in the report.
- Caption: one reserved line, `min-height: 1.5em`, `text-align: center`; element name colored `var(--el)` of the active element; never let it collapse (no-layout-shift).
- Route changes: remove `{#if selectedPair && data}` gating — always `<ShapeMatrixDrill pair={selectedPair} {data} />` (pass `data!` only when loaded; while `!data` keep the panel's "Pick a cell" by passing `pair={null}` with a loaded=false guard — simplest: `{#if data}<ShapeMatrixDrill pair={selectedPair} {data} />{:else}<div class="drill-loading">Building flowers…</div>{/if}` with `.drill-loading` styled like the old `.drill-empty` hint). Delete `.drill-empty*`, `.ghost-*` markup and CSS from the route. Keep `bind:this={drillPane}` + the `scrollIntoView` behavior and `scroll-margin-top`.

- [x] **Step 1: Rework the drill component** per the contract above. Keep the file's commenting style; update the header comment to describe the elemental drill and cite the spec path.
- [x] **Step 2: Update the route** per the notes above.
- [x] **Step 3: Targeted tests still green** (14/14 pass)

Run: `npx vitest run tests/unit/shape-matrix-elemental-drill.test.ts tests/unit/shape-matrix-engine-contract.test.ts tests/unit/notation-roots-remediation-contract.test.ts`
Expected: ALL PASS. If the engine contract fails on a new import, you introduced a lab deep-path — fix the import, do not loosen the test.

- [x] **Step 4: Grep proofs**

```bash
grep -n "type=\"checkbox\"" src/lib/shared/shape-matrix/components/*.svelte "src/routes/(public)/notation/shape-matrix/+page.svelte"   # expect: no matches
grep -nP "\x{2014}" src/lib/shared/shape-matrix/components/*.svelte "src/routes/(public)/notation/shape-matrix/+page.svelte"          # expect: no matches in user-visible strings
grep -n "\.word" src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte                                                        # every display hit wrapped in simplifyRepeatedWord
grep -rn "half turn\|quarter turn" src/lib/shared/shape-matrix/ "src/routes/(public)/notation/shape-matrix/"                            # expect: no matches
```

- [x] **Step 5: Commit** (33e42936ef, pushed)

```bash
git pull --rebase
git commit -m "feat(shape-matrix): elemental drill replaces card thumbnails on the public destination" -- src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte "src/routes/(public)/notation/shape-matrix/+page.svelte"
```

---

### Task 5: Browser verification

- [x] **Step 1:** Open `https://localhost:5173/notation/shape-matrix` via Chrome DevTools MCP (Chrome is not pre-opened; launch it per the memory note — `--remote-debugging-port=9222` if attach fails). Wait for the grid (>100 imgs/canvases under `.matrix-stage`).
- [x] **Step 2:** Read-only checks: screenshot the panel's no-cell state (disabled chips + hint). Then ASK AUSTEN before driving clicks ("May I click a cell and the chips to verify the drill?" — interactive DevTools needs explicit permission in-conversation; if he already granted control this session, proceed).
- [~] deferred (awaiting Austen's click permission) **Step 3:** With permission: click a mid-matrix cell → screenshot (still mandala, full opacity, caption shows the pair). Click Water → screenshot after ~3s (props animating, VISIBLE glowing trail, mandala ghosted beneath, caption `Water · Split-Same · {word}`). Click Water again → back to still mandala. Click Fire, then a different cell → new shape animates in Fire without re-picking (sticky). Measure `document.documentElement.scrollWidth - clientWidth` → 0.
- [~] deferred (needs Step 3 clicks; static alignment contract test green) **Step 4:** Confirm alignment with evidence: with an element animating, `evaluate_script` the hero square's bounding box vs the AnimatorCanvas canvas box — same square (±1px). The trail should visibly ride the ghost mandala's loci in the screenshot; if it visibly diverges, STOP and report (alignment contract broken — do not hand-tune constants).
- [x] **Step 5:** If any screenshot cannot be produced, report exactly what Austen must check instead (verification-protocol.md). Commit nothing in this task.

---

### Task 6: Elemental lineage credit (small, Austen may strike at review)

- [x] **Step 1:** In `src/routes/(public)/notation/+page.svelte`, at the end of the existing lineage/Shape-Matrix arc's prose (NOT the destination page), add one sentence: `The elemental lenses on the interactive matrix trace to Leonardo Icaza's four-element mapping of VTG timing and direction, taught on video by Ronan McLoughlin and extended with Sun and Moon by TKA.` No em dashes; plain prose; no links required.
- [x] **Step 2:** `npx vitest run tests/unit/notation-roots-remediation-contract.test.ts` → PASS (8/8).
- [x] **Step 3:** Commit: `git pull --rebase && git commit -m "feat(notation): credit the elemental model lineage" -- "src/routes/(public)/notation/+page.svelte"`

---

## Final report requirements

Lead with what a visitor now experiences, then: commit SHAs, test outputs, grep proofs, screenshots (attach), the alignment-evidence numbers, and any divergence from spec (flagged, not silently redesigned). Clickable HTTPS link to the page. Do NOT run a full check/build; note that the final full-check gate belongs to the main session.
