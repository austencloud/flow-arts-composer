# Menagerie Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the creature mode out of Silk into a new `menagerie` effect (snake / dragon / caterpillar), return Silk to a pure velocity ribbon, and retire Frost from the roster.

**Architecture:** Silk's `silk-2d-renderer.ts` holds two independent render models — a velocity ribbon and a fixed-length "serpent" creature chain. Extract the creature model into a new `menagerie` effect with its own intent, params, renderer, overlay plugin, presets, and customize panel, mirroring how every existing effect is wired. Silk loses the `form`/creature fields and its serpent branch. A `v29 → v30` migration moves persisted serpent configs to `menagerie` and neutralizes Frost. Frost is removed from the roster array only (code left dormant; physical deletion is a follow-up spec).

**Tech Stack:** TypeScript, Svelte 5 runes, Canvas 2D, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-menagerie-effect-design.md`

**Conventions (read once):**
- All work on `main` (no worktree — project rule).
- Inner loop: `npm run check:watch` in a background terminal; do NOT run full `npm run check`/`build` per task. One full `npm run check` at the final gate.
- Commit each task with an **explicit pathspec** (`git commit -m "..." -- <files>`) — the index is shared with other agents. Never a bare `git commit`.
- Run a single test file with: `npx vitest run <path>`.

---

## File Structure

**Created:**
| Path | Responsibility |
|---|---|
| `src/lib/shared/effects/renderers/ribbon-trace.ts` | Shared Catmull-Rom spline helpers (`traceForward`/`traceBackward`), hoisted from the silk renderer. |
| `src/lib/shared/effects/renderers/menagerie-2d-renderer.ts` | The creature renderer (extracted serpent code + caterpillar ornament). |
| `src/lib/shared/effects/renderers/menagerie-2d-renderer.test.ts` | Creature renderer tests (moved from silk serpent tests + caterpillar smoke). |
| `src/lib/shared/effects/domain/menagerie-palettes.ts` | Re-exports the shared silk palette registry + `resolveMenageriePalette`. |
| `src/lib/shared/animation-engine/components/effects-panel/presets/menagerie-presets.ts` | `MENAGERIE_PRESETS` + `MENAGERIE_PRESET_GROUP`. |
| `src/lib/shared/animation-engine/components/effects-panel/customize/MenagerieCustomize.svelte` | Menagerie customize panel (no `form` fork). |
| `src/lib/shared/animation-engine/services/menagerie-overlay-renderer.ts` | `MenagerieOverlayRenderer` + `menagerieEffectPlugin`. |

**Modified:**
`silk-2d-renderer.ts`, `silk-palettes.ts`, `silk-presets.ts`, `SilkCustomize.svelte`, `effects-config.ts`, `defaults.ts`, `canvas2d-types.ts`, `canvas2d-translator.ts`, `effect-registry.ts`, `services/effects/registry.ts`, `frame-parameter-builder.ts`, `effect-renderer-manager.ts`, `IAnimationRenderLoop.ts` (FrameParams type), `migrations.ts`, `preset-data.test.ts`, `effect-registry.test.ts`, `silk-2d-renderer.test.ts`.

---

## Task 1: Hoist shared spline helpers into `ribbon-trace.ts`

Behavior-preserving refactor. Both renderers need `traceForward`/`traceBackward`; extract them so the menagerie renderer doesn't copy them.

**Files:**
- Create: `src/lib/shared/effects/renderers/ribbon-trace.ts`
- Modify: `src/lib/shared/effects/renderers/silk-2d-renderer.ts`

- [ ] **Step 1: Create `ribbon-trace.ts`** with the two helpers moved verbatim from `silk-2d-renderer.ts` (currently the `traceForward`/`traceBackward` private methods, lines ~276-323), converted to free functions:

```ts
/**
 * Catmull-Rom spline tracers shared by the silk ribbon and the menagerie
 * creature renderers. Moved out of silk-2d-renderer so both consume one copy.
 */

/** Catmull-Rom spline forward through an edge array. Starts with moveTo. */
export function traceForward(
  ctx: CanvasRenderingContext2D,
  x: number[],
  y: number[],
  start: number,
  end: number,
  n: number,
): void {
  ctx.moveTo(x[start]!, y[start]!);
  for (let i = start + 1; i <= end; i++) {
    const i0 = Math.max(0, i - 2);
    const i1 = i - 1;
    const i3 = Math.min(n - 1, i + 1);
    ctx.bezierCurveTo(
      x[i1]! + (x[i]! - x[i0]!) / 6,
      y[i1]! + (y[i]! - y[i0]!) / 6,
      x[i]! - (x[i3]! - x[i1]!) / 6,
      y[i]! - (y[i3]! - y[i1]!) / 6,
      x[i]!,
      y[i]!,
    );
  }
}

/** Catmull-Rom spline backward through an edge array. Continues current path (no moveTo). */
export function traceBackward(
  ctx: CanvasRenderingContext2D,
  x: number[],
  y: number[],
  start: number,
  end: number,
  n: number,
): void {
  ctx.lineTo(x[end]!, y[end]!);
  for (let i = end - 1; i >= start; i--) {
    const i0 = Math.min(n - 1, i + 2);
    const i1 = i + 1;
    const i3 = Math.max(0, i - 1);
    ctx.bezierCurveTo(
      x[i1]! + (x[i]! - x[i0]!) / 6,
      y[i1]! + (y[i]! - y[i0]!) / 6,
      x[i]! - (x[i3]! - x[i1]!) / 6,
      y[i]! - (y[i3]! - y[i1]!) / 6,
      x[i]!,
      y[i]!,
    );
  }
}
```

- [ ] **Step 2:** In `silk-2d-renderer.ts`, delete the `traceForward` and `traceBackward` private methods, add `import { traceForward, traceBackward } from "./ribbon-trace";`, and replace every `this.traceForward(` / `this.traceBackward(` call with `traceForward(` / `traceBackward(`. Leave `traceSpine` (silk-only) as-is but change its internal `this.traceForward` usage if any (it has none — it inlines its own bezier). 

- [ ] **Step 3: Verify silk still type-checks and its tests pass**

Run: `npx vitest run src/lib/shared/effects/renderers/silk-2d-renderer.test.ts`
Expected: PASS (behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(effects): hoist ribbon spline tracers into ribbon-trace" -- src/lib/shared/effects/renderers/ribbon-trace.ts src/lib/shared/effects/renderers/silk-2d-renderer.ts
```

---

## Task 2: Add `MenagerieIntent` to config, defaults, activePresets

Types + data only. Compiles green before any renderer exists.

**Files:**
- Modify: `src/lib/shared/effects/domain/effects-config.ts`
- Modify: `src/lib/shared/effects/domain/defaults.ts`

- [ ] **Step 1:** In `effects-config.ts`, add the interface (place it directly after `SilkIntent`):

```ts
export interface MenagerieIntent {
  /** Which creature ornaments the fixed-length chain. */
  creature: "snake" | "dragon" | "caterpillar";
  /** Named palette (shared with silk). "custom" uses customColor. */
  palette: "satin" | "velvet" | "ethereal" | "shadow" | "gold_leaf" | "ember" | "custom";
  /** Hex - used only when palette === "custom". */
  customColor: string;
  /** 0-1. Overall opacity + width multiplier. */
  intensity: number;
  /** 0-1. Base body half-width. Maps to 5-30px. */
  width: number;
  /** 0-1. Body length. Maps to ~120-480px of fixed arc-length. */
  bodyLength: number;
  /** 0-1. Undulation amplitude (the wag). Ramps 0 at head → max at tail. */
  slither: number;
  /** Which staff end(s) the creature tracks. */
  trackingMode: "left_end" | "right_end" | "both_ends";
}
```

- [ ] **Step 2:** In `effects-config.ts`, add `menagerie: MenagerieIntent;` to the `EffectsConfig` interface (place it next to `silk: SilkIntent;`), and add `menagerie: string | null;` to the `activePresets` block (next to `silk: string | null;`). Bump the version constant: find `EFFECTS_CONFIG_VERSION` and increment it by 1 (from 29 to 30).

- [ ] **Step 3:** In `defaults.ts`, add the default block (next to the `silk:` block):

```ts
  menagerie: {
    creature: "snake",
    palette: "velvet",
    customColor: "#600018",
    intensity: 0.85,
    width: 0.55,
    bodyLength: 0.55,
    slither: 0.55,
    trackingMode: "right_end",
  },
```

and add `menagerie: null,` to the `activePresets` block in `DEFAULT_EFFECTS_CONFIG`.

- [ ] **Step 4: Verify the config test still passes**

Run: `npx vitest run tests/unit/effects/domain/default-config.test.ts`
Expected: PASS (or update it in Task 10 if it asserts an exact key set — note the failure and carry it to Task 10).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(menagerie): add MenagerieIntent + default + version bump" -- src/lib/shared/effects/domain/effects-config.ts src/lib/shared/effects/domain/defaults.ts
```

---

## Task 3: Share the palette registry via `menagerie-palettes.ts`

Menagerie reuses silk's exact palette swatches. Share, don't copy (never-hand-roll).

**Files:**
- Modify: `src/lib/shared/effects/domain/silk-palettes.ts`
- Create: `src/lib/shared/effects/domain/menagerie-palettes.ts`

- [ ] **Step 1:** In `silk-palettes.ts`, generalize `resolveSilkPalette` to accept the palette fields structurally so menagerie can reuse it. Add an exported alias that takes `{ palette; customColor }`:

```ts
/** Shared resolver: menagerie reuses silk's exact palette registry. */
export function resolvePaletteByIntent(intent: {
  palette: SilkIntent["palette"];
  customColor: string;
}): SilkPalette {
  if (intent.palette === "custom") return deriveCustomPalette(intent.customColor);
  return PALETTE_REGISTRY[intent.palette] ?? PALETTE_REGISTRY.satin!;
}
```

Keep `resolveSilkPalette` as a thin wrapper: `export function resolveSilkPalette(intent: SilkIntent): SilkPalette { return resolvePaletteByIntent(intent); }`.

- [ ] **Step 2:** Create `menagerie-palettes.ts`:

```ts
import type { MenagerieIntent } from "./effects-config";
import { resolvePaletteByIntent, type SilkPalette } from "./silk-palettes";

export type MenageriePalette = SilkPalette;

export function resolveMenageriePalette(intent: MenagerieIntent): MenageriePalette {
  return resolvePaletteByIntent(intent);
}
```

- [ ] **Step 3: Verify**

Run: `npx vitest run src/lib/shared/effects/renderers/silk-2d-renderer.test.ts`
Expected: PASS (silk palette path unchanged).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(menagerie): share silk palette registry via menagerie-palettes" -- src/lib/shared/effects/domain/silk-palettes.ts src/lib/shared/effects/domain/menagerie-palettes.ts
```

---

## Task 4: Create `Menagerie2DParams` + `resolveMenagerie2D`

**Files:**
- Modify: `src/lib/shared/effects/translators/canvas2d-types.ts`
- Modify: `src/lib/shared/effects/translators/canvas2d-translator.ts`

- [ ] **Step 1:** In `canvas2d-types.ts`, add the import `MenagerieIntent` to the `effects-config` import block, add `import type { MenageriePalette } from "../domain/menagerie-palettes";`, and add the params interface (after `Silk2DParams`):

```ts
export interface Menagerie2DParams extends MenagerieIntent {
  resolvedPalette: MenageriePalette;
  /** px - base body half-width at width=1. */
  baseHalfWidth: number;
  /** px - fixed total arc-length of the creature body. */
  bodyLengthPx: number;
  /** Number of spine chain nodes (head = node 0). */
  segmentCount: number;
  /** px - max lateral undulation amplitude at the tail. */
  slitherAmpPx: number;
  /** Canvas composite op. */
  blendMode?: GlobalCompositeOperation;
}
```

- [ ] **Step 2:** In `canvas2d-translator.ts`, add `MenagerieIntent` to the intent imports, `Menagerie2DParams` to the params imports, and `import { resolveMenageriePalette } from "../domain/menagerie-palettes";`. Add the resolver (after `resolveSilk2D`):

```ts
export function resolveMenagerie2D(
  intent: MenagerieIntent,
  override: Partial<Menagerie2DParams> = {},
): Menagerie2DParams {
  const palette = resolveMenageriePalette(intent);
  const defaults: Omit<Menagerie2DParams, keyof MenagerieIntent> = {
    resolvedPalette: palette,
    baseHalfWidth: 5 + intent.width * 25, // 5-30px
    bodyLengthPx: 120 + intent.bodyLength * 360, // 120-480px fixed spine length
    segmentCount: 40,
    slitherAmpPx: intent.slither * 42,
    blendMode: palette.emissive ? "lighter" : "source-over",
  };
  return { ...intent, ...defaults, ...override };
}
```

- [ ] **Step 3: Verify type-check**

Confirm `check:watch` shows no errors in these two files.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(menagerie): add Menagerie2DParams + resolveMenagerie2D" -- src/lib/shared/effects/translators/canvas2d-types.ts src/lib/shared/effects/translators/canvas2d-translator.ts
```

---

## Task 5: Create `menagerie-2d-renderer.ts` (extract serpent + add caterpillar)

Copy the creature code out of `silk-2d-renderer.ts` into a standalone renderer, drop the ribbon path and the `form` check, and add the caterpillar ornament.

**Files:**
- Create: `src/lib/shared/effects/renderers/menagerie-2d-renderer.ts`
- Create: `src/lib/shared/effects/renderers/menagerie-2d-renderer.test.ts`

- [ ] **Step 1: Write the caterpillar smoke test first (TDD)** in `menagerie-2d-renderer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Menagerie2DRenderer } from "./menagerie-2d-renderer";
import type { Menagerie2DParams } from "../translators/canvas2d-types";
import { resolveMenageriePalette } from "../domain/menagerie-palettes";

function params(creature: Menagerie2DParams["creature"]): Menagerie2DParams {
  const intent = {
    creature,
    palette: "velvet" as const,
    customColor: "#600018",
    intensity: 0.85,
    width: 0.55,
    bodyLength: 0.55,
    slither: 0.55,
    trackingMode: "both_ends" as const,
  };
  return {
    ...intent,
    resolvedPalette: resolveMenageriePalette(intent),
    baseHalfWidth: 18,
    bodyLengthPx: 300,
    segmentCount: 40,
    slitherAmpPx: 23,
    blendMode: "source-over",
  };
}

// jsdom has no real 2D context; assert the renderer drives the chain without throwing.
function fakeCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  return new Proxy(
    {
      canvas: { width: 400, height: 400 },
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      createRadialGradient: () => ({ addColorStop: noop }),
      createLinearGradient: () => ({ addColorStop: noop }),
    } as unknown as CanvasRenderingContext2D,
    { get: (t, p) => (p in t ? (t as any)[p] : noop), set: () => true },
  );
}

describe("Menagerie2DRenderer", () => {
  for (const creature of ["snake", "dragon", "caterpillar"] as const) {
    it(`renders ${creature} without throwing`, () => {
      const r = new Menagerie2DRenderer();
      const ctx = fakeCtx();
      const tips = [{ x: 100, y: 100, end: "A" as const, propIndex: 0, tipIndex: 0 }];
      // Two frames so the follow-chain advances.
      expect(() => r.render(ctx, params(creature), tips, 0.016, 1, false)).not.toThrow();
      tips[0]!.x = 140;
      expect(() => r.render(ctx, params(creature), tips, 0.016, 1, false)).not.toThrow();
      r.dispose();
    });
  }
});
```

- [ ] **Step 2: Run it — expect failure** (module not found)

Run: `npx vitest run src/lib/shared/effects/renderers/menagerie-2d-renderer.test.ts`
Expected: FAIL ("Cannot find module ./menagerie-2d-renderer").

- [ ] **Step 3: Create `menagerie-2d-renderer.ts`.** Start from the CURRENT `silk-2d-renderer.ts` serpent code. Concretely:
  - Class `Menagerie2DRenderer` with fields: `private time = 0;`, `private chains = new Map<string, Vec2[]>();`, `private whiskerChains = new Map<string, [Vec2[], Vec2[]]>();` (rename `serpentChains` → `chains`).
  - `import { traceForward, traceBackward } from "./ribbon-trace";` and `import type { Menagerie2DParams } from "../translators/canvas2d-types";`, `import type { EmitterTip } from "./emitter-tip"; import { emitterId } from "./emitter-tip";`.
  - Keep types `Vec2`, constants `AURA_STRIDE=8`, `TAU`, `SERPENT_WAVENUMBER=0.045`, `SERPENT_SLITHER_SPEED=3.2`, `WHISKER_NODES=6`, and utilities `hexToRgb`, `serpentWidth`, `hashPhase` (copy verbatim from silk renderer).
  - `render(ctx, params: Menagerie2DParams, emitters, dt, scale=1, loopDetected=false)`: increment `this.time += dt`; build `present` exactly as silk's `renderSerpent` does (filter by `isEndEnabled`), then run the serpent body of `renderSerpent` directly (no `params.form` check — menagerie is always a creature). Reuse the existing `drawSerpent`/`drawDorsalCrest`/`drawWhiskers`/`drawSerpentHead` methods verbatim, renaming `drawSerpent`→`drawCreature` for clarity (optional).
  - `isEndEnabled`, `dispose` (clear `chains`, `whiskerChains`, reset `time`) copied over.
  - **DELETE** all ribbon-only code (`RibbonSample`, `tipTrails`, `lastTipPos`, `drawRibbon`, `traceSpine`, `MAX_SAMPLES`, `SEGMENTS`, `lerpHex` if unused by creature path — note `lerpHex` is ribbon-only; the serpent path uses gradients not `lerpHex`, so drop it).

- [ ] **Step 4: Add the caterpillar ornament.** In `drawCreature` (the former `drawSerpent`), the creature branch currently handles `dragon` (crest + whiskers + horns) and `snake` (tongue). Add caterpillar:

  a. After computing `cx/cy/nx/ny/hw/leftX.../rightX...` and BEFORE the body fill (mirror where the dragon crest draws), add:

```ts
    if (params.creature === "caterpillar") {
      this.drawCaterpillarLegs(ctx, params, cx, cy, nx, ny, hw);
    }
```

  b. After the sheen highlight (Layer D), add segment banding for caterpillar:

```ts
    if (params.creature === "caterpillar") {
      this.drawCaterpillarBands(ctx, params, cx, cy, nx, ny, hw);
    }
```

  c. Add the two methods (concrete, mirrors `drawDorsalCrest` structure):

```ts
  /** Caterpillar walking legs — short alternating nubs below each body segment. */
  private drawCaterpillarLegs(
    ctx: CanvasRenderingContext2D,
    params: Menagerie2DParams,
    cx: number[],
    cy: number[],
    nx: number[],
    ny: number[],
    hw: number[],
  ): void {
    const pal = params.resolvedPalette;
    const N = cx.length;
    ctx.globalAlpha = 0.85 * params.intensity;
    ctx.strokeStyle = pal.edge;
    ctx.lineCap = "round";
    for (let i = 4; i < N - 2; i += 3) {
      const h = hw[i]!;
      if (h < 1.5) continue;
      const legLen = h * 0.9;
      // Walking phase: legs on alternating segments swing fore/aft.
      const swing = Math.sin(this.time * 6 + i * 0.9) * 0.35;
      ctx.lineWidth = Math.max(1, h * 0.22);
      for (const side of [-1, 1]) {
        const bx = cx[i]! + nx[i]! * side * h;
        const by = cy[i]! + ny[i]! * side * h;
        // Tangent (approx) for the fore/aft swing.
        const tx = cx[Math.min(N - 1, i + 1)]! - cx[Math.max(0, i - 1)]!;
        const ty = cy[Math.min(N - 1, i + 1)]! - cy[Math.max(0, i - 1)]!;
        const tl = Math.hypot(tx, ty) || 1;
        const ex = bx + nx[i]! * side * legLen + (tx / tl) * legLen * swing;
        const ey = by + ny[i]! * side * legLen + (ty / tl) * legLen * swing;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Caterpillar segment banding — cross-body rings that read as body segments. */
  private drawCaterpillarBands(
    ctx: CanvasRenderingContext2D,
    params: Menagerie2DParams,
    cx: number[],
    cy: number[],
    nx: number[],
    ny: number[],
    hw: number[],
  ): void {
    const pal = params.resolvedPalette;
    const N = cx.length;
    ctx.globalAlpha = 0.28 * params.intensity;
    ctx.strokeStyle = pal.edge;
    ctx.lineCap = "round";
    for (let i = 4; i < N - 2; i += 3) {
      const h = hw[i]!;
      if (h < 1) continue;
      ctx.lineWidth = Math.max(1, h * 0.4);
      ctx.beginPath();
      ctx.moveTo(cx[i]! + nx[i]! * h, cy[i]! + ny[i]! * h);
      ctx.lineTo(cx[i]! - nx[i]! * h, cy[i]! - ny[i]! * h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
```

  d. In `drawSerpentHead` (rename `drawCreatureHead`), the head fill + eyes are creature-agnostic (keep). The dragon-horns block stays gated `if (params.creature === "dragon")`. Add caterpillar antennae before the head fill:

```ts
    if (params.creature === "caterpillar") {
      ctx.globalAlpha = 0.9 * params.intensity;
      ctx.strokeStyle = pal.edge;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, headR * 0.18);
      for (const side of [-1, 1]) {
        const bx = headCx + hx * headR * 0.4 + perpX * side * headR * 0.35;
        const by = headCy + hy * headR * 0.4 + perpY * side * headR * 0.35;
        const ex = bx + hx * headR * 1.1 + perpX * side * headR * 0.6;
        const ey = by + hy * headR * 1.1 + perpY * side * headR * 0.6;
        const cxp = bx + hx * headR * 0.6 + perpX * side * headR * 0.9;
        const cyp = by + hy * headR * 0.6 + perpY * side * headR * 0.9;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(cxp, cyp, ex, ey);
        ctx.stroke();
        // Antenna knob.
        ctx.fillStyle = pal.edge;
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(1.2, headR * 0.16), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
```

  The snake tongue block stays gated `if (params.creature === "snake")` (unchanged).

- [ ] **Step 5: Run the renderer test — expect PASS**

Run: `npx vitest run src/lib/shared/effects/renderers/menagerie-2d-renderer.test.ts`
Expected: PASS (all three creatures render without throwing).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(menagerie): creature renderer with snake/dragon/caterpillar" -- src/lib/shared/effects/renderers/menagerie-2d-renderer.ts src/lib/shared/effects/renderers/menagerie-2d-renderer.test.ts
```

---

## Task 6: Create the overlay plugin + register it

**Files:**
- Create: `src/lib/shared/animation-engine/services/menagerie-overlay-renderer.ts`
- Modify: `src/lib/shared/animation-engine/services/effects/registry.ts`

- [ ] **Step 1: Create `menagerie-overlay-renderer.ts`** (mirror of `silk-overlay-renderer.ts`):

```ts
import type { Menagerie2DParams } from "$lib/shared/effects/translators/canvas2d-types";
import { Menagerie2DRenderer } from "$lib/shared/effects/renderers/menagerie-2d-renderer";
import type { EmitterTip } from "$lib/shared/effects/renderers/emitter-tip";
import { EffectRenderer } from "./effects/effect-renderer";

export class MenagerieOverlayRenderer extends EffectRenderer {
  private renderer = new Menagerie2DRenderer();

  renderFrame(params: Menagerie2DParams, tips: EmitterTip[], dt: number, loopDetected?: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this.renderer.render(ctx, params, tips, dt, this.scale, loopDetected);
  }

  protected override onClear(): void {
    this.renderer.dispose();
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

// ── EffectPlugin descriptor ──────────────────────────────────────────────────
import type { EffectPlugin } from "./effects/effect-plugin";
import type { MenagerieIntent } from "$lib/shared/effects/domain/effects-config";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";

export const menagerieEffectPlugin: EffectPlugin<MenagerieIntent> = {
  id: "menagerie",
  kind: "canvas2d",
  createRenderer: () => new MenagerieOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.menagerie,
  configKey: "menagerieRenderer",
};
```

- [ ] **Step 2:** In `services/effects/registry.ts`, add `import { menagerieEffectPlugin } from "../menagerie-overlay-renderer";` and add `menagerieEffectPlugin,` to the plugin array (next to `silkEffectPlugin,`).

- [ ] **Step 3: Verify** `check:watch` clean in both files.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(menagerie): overlay plugin + registry registration" -- src/lib/shared/animation-engine/services/menagerie-overlay-renderer.ts src/lib/shared/animation-engine/services/effects/registry.ts
```

---

## Task 7: Plumb menagerie params through the frame builder + renderer manager

Silk is threaded through `frame-parameter-builder.ts` (per-effect resolved config with ref-identity diffing), the `FrameParams` type in `IAnimationRenderLoop.ts`, and `effect-renderer-manager.ts`. Add a parallel `menagerie` path everywhere silk appears.

**Files:**
- Modify: `src/lib/shared/animation-engine/services/frame-parameter-builder.ts`
- Modify: `src/lib/shared/animation-engine/services/IAnimationRenderLoop.ts`
- Modify: `src/lib/shared/animation-engine/services/effect-renderer-manager.ts`

- [ ] **Step 1:** In `frame-parameter-builder.ts`, mirror every `silk` reference. Add to imports: `Menagerie2DParams` (from canvas2d-types), `resolveMenagerie2D` (from canvas2d-translator), `MenagerieIntent` (from effects-config). Add fields near the silk ones:

```ts
  private menagerieConfig: Menagerie2DParams = resolveMenagerie2D(DEFAULT_EFFECTS_CONFIG.menagerie);
  private prevMenagerieIntentRef: MenagerieIntent | null = null;
```

Add `menagerieConfig: null,` to the FrameParams init object (next to `silkConfig: null,`). Add the diff block (next to the silk block ~line 396-404):

```ts
    // Menagerie overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.menagerie;
      if (intent !== this.prevMenagerieIntentRef) {
        this.prevMenagerieIntentRef = intent;
        this.menagerieConfig = resolveMenagerie2D(intent);
      }
    }
    fp.menagerieConfig = erm.wasEnabled("menagerie") ? this.menagerieConfig : null;
```

- [ ] **Step 2:** In `IAnimationRenderLoop.ts`, find the `FrameParams` interface (it declares `silkConfig: Silk2DParams | null;` etc.). Add `menagerieConfig: Menagerie2DParams | null;` next to it, and add the `Menagerie2DParams` import. Grep to confirm the exact field style: `grep -n "silkConfig" src/lib/shared/animation-engine/services/IAnimationRenderLoop.ts`.

- [ ] **Step 3:** In `effect-renderer-manager.ts`, the manager owns overlay renderers keyed by effect id and orders layers. Grep `grep -n "silk" src/lib/shared/animation-engine/services/effect-renderer-manager.ts` and, for each occurrence that enumerates or switches on effect ids / configs, add the parallel `menagerie` entry consuming `frameParams.menagerieConfig`. Follow the exact shape the silk lines use (the manager is uniform per effect).

- [ ] **Step 4: Verify** `check:watch` clean across all three files. Run the effects unit tests:

Run: `npx vitest run tests/unit/effect-registry.test.ts`
Expected: may FAIL on count assertions — that's Task 9/10's job; note it and continue if the only failures are effect-count assertions.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(menagerie): plumb params through frame builder + renderer manager" -- src/lib/shared/animation-engine/services/frame-parameter-builder.ts src/lib/shared/animation-engine/services/IAnimationRenderLoop.ts src/lib/shared/animation-engine/services/effect-renderer-manager.ts
```

---

## Task 8: Presets, customize panel, roster registration (add Menagerie)

**Files:**
- Create: `src/lib/shared/animation-engine/components/effects-panel/presets/menagerie-presets.ts`
- Create: `src/lib/shared/animation-engine/components/effects-panel/customize/MenagerieCustomize.svelte`
- Modify: `src/lib/shared/animation-engine/components/effects-panel/effect-registry.ts`

- [ ] **Step 1: Create `menagerie-presets.ts`.** Every preset pins `creature` (the mode-discriminator invariant that fixed the silk bug):

```ts
import type { EffectPreset, EffectPresetGroup } from "./types";

export const MENAGERIE_PRESETS: EffectPreset<"menagerie">[] = [
  {
    id: "menagerie-serpent",
    name: "Serpent",
    previewColor: "#3aa655",
    patch: {
      creature: "snake",
      palette: "velvet",
      intensity: 0.85,
      width: 0.55,
      bodyLength: 0.55,
      slither: 0.55,
      trackingMode: "right_end",
    },
  },
  {
    id: "menagerie-dragon",
    name: "Dragon",
    previewColor: "#ff6000",
    previewColor2: "#ffcc00",
    patch: {
      creature: "dragon",
      palette: "ember",
      intensity: 0.9,
      width: 0.6,
      bodyLength: 0.7,
      slither: 0.45,
      trackingMode: "right_end",
    },
  },
  {
    id: "menagerie-caterpillar",
    name: "Caterpillar",
    previewColor: "#9acd32",
    patch: {
      creature: "caterpillar",
      palette: "ethereal",
      intensity: 0.8,
      width: 0.6,
      bodyLength: 0.5,
      slither: 0.6,
      trackingMode: "right_end",
    },
  },
  {
    id: "menagerie-basilisk",
    name: "Basilisk",
    previewColor: "#101020",
    patch: {
      creature: "snake",
      palette: "shadow",
      intensity: 0.8,
      width: 0.5,
      bodyLength: 0.65,
      slither: 0.5,
      trackingMode: "right_end",
    },
  },
  {
    id: "menagerie-wyrm",
    name: "Wyrm",
    previewColor: "#ffd700",
    patch: {
      creature: "dragon",
      palette: "gold_leaf",
      intensity: 0.85,
      width: 0.6,
      bodyLength: 0.75,
      slither: 0.4,
      trackingMode: "right_end",
    },
  },
];

export const MENAGERIE_PRESET_GROUP: EffectPresetGroup = {
  effectType: "menagerie",
  presets: MENAGERIE_PRESETS,
  getSummary: (state) => {
    const s = state.menagerie;
    return `${s.creature} · ${s.palette} · length ${Math.round(s.bodyLength * 100)}% · slither ${Math.round(s.slither * 100)}%`;
  },
};
```

Note: `EffectPreset<"menagerie">` requires `menagerie` to be a key of the preset config map. Grep the map type: `grep -rn "EffectConfigMap" src/lib/shared/animation-engine/components/effects-panel/presets/types.ts` and add a `menagerie: MenagerieIntent` entry wherever the map that backs `EffectPreset<E>` / `getSummary`'s `state` is declared (same place `silk` is listed). If `getSummary`'s `state` is typed against `EffectsConfig`, no change needed beyond Task 2.

- [ ] **Step 2: Create `MenagerieCustomize.svelte`** (adapt `SilkCustomize.svelte`, drop the `form` fork, keep Creature always visible):

```svelte
<script lang="ts">
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { MenagerieIntent } from "$lib/shared/effects/domain/effects-config";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "$lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const PALETTES: { value: MenagerieIntent["palette"]; label: string; swatch: string }[] = [
    { value: "satin", label: "Satin", swatch: "#c0c0d0" },
    { value: "velvet", label: "Velvet", swatch: "#600018" },
    { value: "ethereal", label: "Ethereal", swatch: "#c080ff" },
    { value: "shadow", label: "Shadow", swatch: "#101020" },
    { value: "gold_leaf", label: "Gold Leaf", swatch: "#ffd700" },
    { value: "ember", label: "Ember", swatch: "#ff6000" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const CREATURES: { value: MenagerieIntent["creature"]; label: string }[] = [
    { value: "snake", label: "Snake" },
    { value: "dragon", label: "Dragon" },
    { value: "caterpillar", label: "Caterpillar" },
  ];

  const TRACKING: { value: MenagerieIntent["trackingMode"]; label: string }[] = [
    { value: "left_end", label: "Left" },
    { value: "right_end", label: "Right" },
    { value: "both_ends", label: "Both" },
  ];
</script>

<div class="customize-view">
  <button type="button" class="back-btn" onclick={onBack}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    Back to presets
  </button>

  {#if state}
    <div class="menagerie-controls">
      <OptionChipRow
        label="Creature"
        ariaLabel="Menagerie creature"
        value={state.menagerie.creature}
        options={CREATURES}
        onChange={(v) => state.updateEffect("menagerie", { creature: v })}
      />

      <OptionChipRow
        label="Palette"
        ariaLabel="Menagerie palette"
        value={state.menagerie.palette}
        options={PALETTES}
        onChange={(v) => state.updateEffect("menagerie", { palette: v })}
      />

      {#if state.menagerie.palette === "custom"}
        <div class="color-row">
          <span class="color-label">Tint</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.menagerie.customColor}
                oninput={(e) =>
                  state.updateEffect("menagerie", {
                    customColor: (e.currentTarget as HTMLInputElement).value,
                  })}
              />
            </label>
          </div>
        </div>
      {/if}

      <OptionChipRow
        label="Tracking"
        ariaLabel="Menagerie tracking mode"
        value={state.menagerie.trackingMode}
        options={TRACKING}
        onChange={(v) => state.updateEffect("menagerie", { trackingMode: v })}
      />

      <div class="slider-row">
        <label for="menagerie-intensity">Intensity</label>
        <input
          id="menagerie-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.menagerie.intensity}
          oninput={(e) =>
            state.updateEffect("menagerie", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{Math.round(state.menagerie.intensity * 100)}%</span>
      </div>

      <div class="slider-row">
        <label for="menagerie-width">Width</label>
        <input
          id="menagerie-width"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.menagerie.width}
          oninput={(e) =>
            state.updateEffect("menagerie", {
              width: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{Math.round(state.menagerie.width * 100)}%</span>
      </div>

      <AdvancedControls count={2}>
        <div class="slider-row">
          <label for="menagerie-length">Length</label>
          <input
            id="menagerie-length"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.menagerie.bodyLength}
            oninput={(e) =>
              state.updateEffect("menagerie", {
                bodyLength: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{Math.round(state.menagerie.bodyLength * 100)}%</span>
        </div>

        <div class="slider-row">
          <label for="menagerie-slither">Slither</label>
          <input
            id="menagerie-slither"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.menagerie.slither}
            oninput={(e) =>
              state.updateEffect("menagerie", {
                slither: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{Math.round(state.menagerie.slither * 100)}%</span>
        </div>
      </AdvancedControls>
    </div>
  {:else}
    <p class="empty">Effect state unavailable.</p>
  {/if}
</div>

<style>
  /* Copy the <style> block verbatim from SilkCustomize.svelte, renaming
     .silk-controls → .menagerie-controls. All tokens/rules are identical. */
</style>
```

  (Copy the full `<style>` block from `SilkCustomize.svelte`, renaming the one class `.silk-controls` → `.menagerie-controls`.)

- [ ] **Step 3:** In `effect-registry.ts`: add the import `import { MENAGERIE_PRESET_GROUP } from "./presets/menagerie-presets";`, add `{ id: "menagerie", label: "Menagerie", icon: "fa-dragon", color: "#3aa655" }` to the `EFFECTS` array (place it right after the `silk` entry), add `menagerie: MENAGERIE_PRESET_GROUP,` to `presetGroups`, and add `menagerie: resilientLazyImport(() => import("./customize/MenagerieCustomize.svelte")),` to `customizeLoaders`. (Frost stays in this file for now — removed in Task 10.)

- [ ] **Step 4: Verify the app boots** — check `check:watch` is clean, then load the effects panel:

Run: `curl -sk https://localhost:5173/ -o /dev/null -w "%{http_code}\n"`
Expected: `200`. (Menagerie chip should now appear; visually confirmed by user in the final gate.)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(menagerie): presets, customize panel, roster registration" -- src/lib/shared/animation-engine/components/effects-panel/presets/menagerie-presets.ts src/lib/shared/animation-engine/components/effects-panel/customize/MenagerieCustomize.svelte src/lib/shared/animation-engine/components/effects-panel/effect-registry.ts
```

---

## Task 9: Strip serpent from Silk

Now Menagerie fully owns creatures; remove the serpent model from Silk so it's a pure ribbon.

**Files:**
- Modify: `src/lib/shared/effects/domain/effects-config.ts`
- Modify: `src/lib/shared/effects/renderers/silk-2d-renderer.ts`
- Modify: `src/lib/shared/effects/renderers/silk-2d-renderer.test.ts`
- Modify: `src/lib/shared/effects/translators/canvas2d-types.ts`
- Modify: `src/lib/shared/effects/translators/canvas2d-translator.ts`
- Modify: `src/lib/shared/animation-engine/components/effects-panel/presets/silk-presets.ts`
- Modify: `src/lib/shared/animation-engine/components/effects-panel/customize/SilkCustomize.svelte`

- [ ] **Step 1:** In `effects-config.ts`, remove `form`, `creature`, `bodyLength`, `slither` from `SilkIntent` (and their doc comments).

- [ ] **Step 2:** In `defaults.ts`... (already correct: the silk default still lists `form/creature/bodyLength/slither`). Remove those four keys from the `silk:` default block so it matches the trimmed `SilkIntent`.

- [ ] **Step 3:** In `silk-2d-renderer.ts`: delete the serpent code path — the `if (params.form === "serpent")` block in `render`, the serpent state fields (`serpentChains`, `whiskerChains`), `renderSerpent`, `drawSerpent`, `drawDorsalCrest`, `drawWhiskers`, `drawSerpentHead`, `serpentWidth`, `hashPhase`, and the serpent constants (`SERPENT_WAVENUMBER`, `SERPENT_SLITHER_SPEED`, `WHISKER_NODES`). Also remove the `Vec2` type if now unused. `render` no longer needs the `params.form` check or the "switching back to ribbon" clear. Keep the ribbon path + `traceSpine` + imported `traceForward`/`traceBackward` + `lerpHex`.

- [ ] **Step 4:** In `canvas2d-types.ts`, remove the serpent-only fields from `Silk2DParams` (`bodyLengthPx`, `segmentCount`, `slitherAmpPx`, and the "Serpent form" comment).

- [ ] **Step 5:** In `canvas2d-translator.ts`, remove `bodyLengthPx`/`segmentCount`/`slitherAmpPx` from the `resolveSilk2D` defaults object.

- [ ] **Step 6:** In `silk-presets.ts`, delete the `silk-serpent` and `silk-dragon` preset objects entirely, and remove the now-dead `form: "ribbon",` line from the 6 remaining ribbon presets (since `form` no longer exists on `SilkIntent`). Update `SILK_PRESET_GROUP.getSummary` to drop the `s.form === "serpent"` branch — keep only the ribbon summary line.

- [ ] **Step 7:** In `SilkCustomize.svelte`, delete the `FORMS` and `CREATURES` const arrays, the `Form` `OptionChipRow`, the `Creature` `OptionChipRow`, and every `{#if state.silk.form ...}` / `{#if state.silk.form !== "serpent"}` conditional wrapper (keep the controls that were inside the ribbon branches — Flutter, Duration, Tautness — now unconditional). The serpent Length/Slither sliders are removed.

- [ ] **Step 8: Move serpent renderer tests → menagerie.** In `silk-2d-renderer.test.ts`, cut any test that set `form: "serpent"` / asserted serpent behavior and delete it (the equivalent coverage now lives in `menagerie-2d-renderer.test.ts`). Keep only ribbon assertions. Fix any `Silk2DParams` fixtures that referenced the removed fields.

- [ ] **Step 9: Run both renderer tests**

Run: `npx vitest run src/lib/shared/effects/renderers/silk-2d-renderer.test.ts src/lib/shared/effects/renderers/menagerie-2d-renderer.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git commit -m "refactor(silk): strip serpent form — Silk is now a pure ribbon" -- src/lib/shared/effects/domain/effects-config.ts src/lib/shared/effects/domain/defaults.ts src/lib/shared/effects/renderers/silk-2d-renderer.ts src/lib/shared/effects/renderers/silk-2d-renderer.test.ts src/lib/shared/effects/translators/canvas2d-types.ts src/lib/shared/effects/translators/canvas2d-translator.ts src/lib/shared/animation-engine/components/effects-panel/presets/silk-presets.ts src/lib/shared/animation-engine/components/effects-panel/customize/SilkCustomize.svelte
```

---

## Task 10: Remove Frost from the roster

Menagerie takes Frost's slot. Roster returns to 16. Frost code stays dormant (physical deletion = follow-up spec).

**Files:**
- Modify: `src/lib/shared/animation-engine/components/effects-panel/effect-registry.ts`
- Modify: `src/lib/shared/animation-engine/components/effects-panel/presets/preset-data.test.ts`
- Modify: `tests/unit/effect-registry.test.ts`

- [ ] **Step 1:** In `effect-registry.ts`, remove the `{ id: "frost", ... }` entry from the `EFFECTS` array. Leave the `frost:` entries in `presetGroups` and `customizeLoaders` (dead but harmless — the registration loop iterates `EFFECTS`, so frost is simply never registered). Add a one-line comment above the dead frost map entries: `// frost: retired from roster (Menagerie took its slot); code dormant, deletion tracked in a follow-up spec.`

- [ ] **Step 2:** In `preset-data.test.ts`, swap the frost import/group for menagerie: remove `import { FROST_PRESET_GROUP }`, add `import { MENAGERIE_PRESET_GROUP } from "./menagerie-presets";`; in the `GROUPS` array replace `FROST_PRESET_GROUP` with `MENAGERIE_PRESET_GROUP`. The count assertion stays `toHaveLength(16)`. Add a menagerie creature-guard test mirroring the silk `form` guard:

```ts
  it("every menagerie preset pins the `creature` mode axis", () => {
    // `creature` decides which ornament renders. applyPreset shallow-merges, so
    // a preset omitting `creature` would inherit the previously-selected one.
    // Same invariant that fixed the silk `form` leak.
    const missing = MENAGERIE_PRESET_GROUP.presets
      .filter((p) => p.patch && !("creature" in (p.patch as Record<string, unknown>)))
      .map((p) => p.id);
    expect(missing, `menagerie presets missing \`creature\`: ${missing.join(", ")}`).toEqual([]);
  });
```

- [ ] **Step 3:** In `tests/unit/effect-registry.test.ts`, update any assertion that enumerates effect ids or asserts frost is present / counts effects. Grep: `grep -n "frost\|menagerie\|length\|toHaveLength\|EFFECTS" tests/unit/effect-registry.test.ts`. Replace frost expectations with menagerie; keep the total effect count the same (16).

- [ ] **Step 4: Run the affected tests**

Run: `npx vitest run src/lib/shared/animation-engine/components/effects-panel/presets/preset-data.test.ts tests/unit/effect-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(menagerie): retire Frost from roster (code dormant)" -- src/lib/shared/animation-engine/components/effects-panel/effect-registry.ts src/lib/shared/animation-engine/components/effects-panel/presets/preset-data.test.ts tests/unit/effect-registry.test.ts
```

---

## Task 11: Migration v29 → v30

Move persisted serpent silk configs to `menagerie`; neutralize Frost. Mirrors the motion→echo / water→goo / echo→ghost migrations already in the file.

**Files:**
- Modify: `src/lib/shared/effects/domain/migrations.ts`
- Create: `tests/unit/effects/domain/menagerie-migration.test.ts`

- [ ] **Step 1: Write the migration test first (TDD).** Create `tests/unit/effects/domain/menagerie-migration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { migrateEffectsConfig } from "$lib/shared/effects/domain/migrations";
import { EFFECTS_CONFIG_VERSION } from "$lib/shared/effects/domain/effects-config";

describe("menagerie migration (v30)", () => {
  it("moves a serpent silk config into menagerie and resets silk to ribbon", () => {
    const raw = {
      version: 29,
      silk: {
        form: "serpent",
        creature: "dragon",
        palette: "ember",
        customColor: "#ff6000",
        intensity: 0.9,
        width: 0.6,
        bodyLength: 0.7,
        slither: 0.45,
        trackingMode: "right_end",
        duration: 0.5,
        flutter: 0.3,
        tautness: 0.5,
      },
      tipEffectMap: { "0:0": { effect: "silk" } },
      activePresets: { silk: "silk-dragon" },
      activeEffect: "silk",
    };
    const out = migrateEffectsConfig(raw);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    // Menagerie received the creature fields.
    expect(out.menagerie.creature).toBe("dragon");
    expect(out.menagerie.palette).toBe("ember");
    expect(out.menagerie.bodyLength).toBeCloseTo(0.7);
    // Silk is back to ribbon (no serpent fields survive).
    expect((out.silk as Record<string, unknown>).form).toBeUndefined();
    // Tip + active state re-pointed at menagerie.
    expect(out.tipEffectMap["0:0"]!.effect).toBe("menagerie");
    expect(out.activePresets.menagerie).toBe("menagerie-dragon");
    expect(out.activeEffect).toBe("menagerie");
  });

  it("leaves a ribbon silk config as silk", () => {
    const raw = {
      version: 29,
      silk: { form: "ribbon", palette: "satin", intensity: 0.7 },
      tipEffectMap: { "0:0": { effect: "silk" } },
      activePresets: { silk: "silk-classic" },
      activeEffect: "silk",
    };
    const out = migrateEffectsConfig(raw);
    expect(out.tipEffectMap["0:0"]!.effect).toBe("silk");
    expect(out.activeEffect).toBe("silk");
  });

  it("neutralizes persisted frost usage", () => {
    const raw = {
      version: 29,
      tipEffectMap: { "0:0": { effect: "frost" }, "1:0": { effect: "trails" } },
      activePresets: { frost: "frost-classic" },
      activeEffect: "frost",
    };
    const out = migrateEffectsConfig(raw);
    expect(out.tipEffectMap["0:0"]).toBeUndefined();
    expect(out.tipEffectMap["1:0"]!.effect).toBe("trails");
    expect((out.activePresets as Record<string, unknown>).frost).toBeUndefined();
    expect(out.activeEffect).toBe("none");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (no v30 logic yet, version mismatch)

Run: `npx vitest run tests/unit/effects/domain/menagerie-migration.test.ts`
Expected: FAIL.

- [ ] **Step 3:** In `migrations.ts`, add the `menagerie` legacy key to the `input` type union (`menagerie?: LegacyRecord;`), and insert the migration block BEFORE the final `out` merge (after the v29 block, ~line 331):

```ts
  // v29 → v30: split silk's serpent form into a standalone "menagerie" effect
  // (snake/dragon/caterpillar), and retire "frost" from the roster. Mirrors the
  // motion→echo / water→goo / echo→ghost moves.
  if (version < 30) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyInput = input as any;

    // 1. Silk serpent → menagerie. silk.form is global, so a serpent form means
    //    every silk-assigned tip was rendering the creature.
    const silk = anyInput.silk as Record<string, any> | undefined;
    const wasSerpent = silk?.form === "serpent";
    if (wasSerpent) {
      anyInput.menagerie ??= {
        creature: silk!.creature ?? "snake",
        palette: silk!.palette ?? "velvet",
        customColor: silk!.customColor ?? "#600018",
        intensity: typeof silk!.intensity === "number" ? silk!.intensity : 0.85,
        width: typeof silk!.width === "number" ? silk!.width : 0.55,
        bodyLength: typeof silk!.bodyLength === "number" ? silk!.bodyLength : 0.55,
        slither: typeof silk!.slither === "number" ? silk!.slither : 0.55,
        trackingMode: silk!.trackingMode ?? "right_end",
      };
      // Reset silk to ribbon — drop the serpent-only fields (merge reseeds them
      // out of existence since SilkIntent no longer has them).
      delete silk!.form;
      delete silk!.creature;
      delete silk!.bodyLength;
      delete silk!.slither;
    }
    if (input.tipEffectMap) {
      for (const key of Object.keys(input.tipEffectMap)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (input.tipEffectMap as any)[key] as Record<string, any> | undefined;
        if (wasSerpent && entry?.effect === "silk") entry.effect = "menagerie";
      }
    }
    if (anyInput.activePresets) {
      const presets = anyInput.activePresets as Record<string, any>;
      if (wasSerpent && typeof presets.silk === "string" && presets.silk.startsWith("silk-")) {
        // silk-serpent → menagerie-serpent, silk-dragon → menagerie-dragon.
        const suffix = presets.silk.slice("silk-".length);
        if (suffix === "serpent" || suffix === "dragon") {
          presets.menagerie = "menagerie-" + suffix;
          delete presets.silk;
        }
      }
    }
    if (wasSerpent && anyInput.activeEffect === "silk") anyInput.activeEffect = "menagerie";

    // 2. Retire frost — neutralize persisted usage so nothing points at a dead
    //    effect. Frost config block + default stay dormant (deletion deferred).
    if (input.tipEffectMap) {
      for (const key of Object.keys(input.tipEffectMap)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (input.tipEffectMap as any)[key] as Record<string, any> | undefined;
        if (entry?.effect === "frost") delete (input.tipEffectMap as any)[key];
      }
    }
    if (anyInput.activePresets && "frost" in anyInput.activePresets) {
      delete (anyInput.activePresets as Record<string, any>).frost;
    }
    if (anyInput.activeEffect === "frost") anyInput.activeEffect = "none";
  }
```

- [ ] **Step 4:** In the final `out` merge object, add the menagerie block next to `silk:`:

```ts
    menagerie: { ...DEFAULT_EFFECTS_CONFIG.menagerie, ...(input.menagerie ?? {}) },
```

- [ ] **Step 5: Run the migration test — expect PASS**

Run: `npx vitest run tests/unit/effects/domain/menagerie-migration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(menagerie): v30 migration — silk serpent→menagerie, retire frost" -- src/lib/shared/effects/domain/migrations.ts tests/unit/effects/domain/menagerie-migration.test.ts
```

---

## Task 12: Full verification gate

- [ ] **Step 1: Full type-check** (the one full run this plan warrants)

Run: `npm run check > /tmp/menagerie-check.log 2>&1; grep -niE "error" /tmp/menagerie-check.log | head -40`
Expected: no errors. Fix any that reference the touched files, re-run once.

- [ ] **Step 2: Run the full effects test surface**

Run: `npx vitest run src/lib/shared/effects tests/unit/effect-registry.test.ts tests/unit/effects src/lib/shared/animation-engine/components/effects-panel/presets`
Expected: PASS.

- [ ] **Step 3: Boot check**

Run: `curl -sk https://localhost:5173/ -o /dev/null -w "%{http_code}\n"`
Expected: `200`.

- [ ] **Step 4: User visual verification** (per verification-protocol — this is the one thing tests can't prove). Ask Austen to:
  - Open the effects panel, select **Menagerie**, cycle Snake → Dragon → Caterpillar, confirm each reads as its creature, and that the caterpillar shows segment bands + legs + antennae.
  - Confirm **Silk** now shows only ribbon presets (no Serpent/Dragon), and cycling ribbon presets never turns into a creature.
  - Confirm **Frost** is gone from the effect list.

- [ ] **Step 5: Final commit** (only if Step 1/2 required fixes)

```bash
git commit -m "fix(menagerie): resolve typecheck + test findings from full gate" -- <only the files you changed>
```

---

## Self-review notes (author)

- **Spec coverage:** intent split (T2/T9), renderer extraction + caterpillar (T1/T5), palette share (T3), params/translator (T4/T9), overlay plugin (T6), full plumbing incl. frame-builder/manager/FrameParams (T7), roster add + presets + customize (T8), Frost retirement (T10), migration both ops (T11), tests throughout, final gate (T12). All spec sections mapped.
- **Type consistency:** `Menagerie2DRenderer`, `Menagerie2DParams`, `MenagerieIntent`, `resolveMenagerie2D`, `menagerieEffectPlugin`, `MENAGERIE_PRESET_GROUP`, `resolveMenageriePalette` used consistently across tasks. Config key `menagerie`. Preset ids `menagerie-{serpent,dragon,caterpillar,basilisk,wyrm}` match the migration's `menagerie-serpent`/`menagerie-dragon` remap.
- **Known grep-confirm points (not placeholders — the field shapes are uniform, engineer confirms exact line):** `EffectConfigMap` map location for `EffectPreset<"menagerie">` (T8 S1), `FrameParams` field style in `IAnimationRenderLoop.ts` (T7 S2), silk enumerations in `effect-renderer-manager.ts` (T7 S3), frost/effect assertions in `effect-registry.test.ts` (T10 S3). Each names the exact grep + the exact parallel line to add.
