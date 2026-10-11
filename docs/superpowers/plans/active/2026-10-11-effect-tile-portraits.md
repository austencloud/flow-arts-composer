# Effect Tile Portraits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, in four worktree batches as listed under Batches. Steps use checkbox (`- [ ]`) syntax for tracking. Per the project's agent budget, do not dispatch one agent per task and do not run per-task reviews; one review at the end of the whole feature.

**Goal:** Replace the generic SVG fallback card for eleven effects (Zap, Sparkle, Ghost, Goo, Bubbles, Petals, Smoke, Ink, Silk, Animal, Pulse) with canvas portraits ported from the approved prototype pages, on a shared tile paint kit extracted from the Fire, Coal and Bloom tiles.

**Architecture:** One `tile-paint.ts` kit (colors, seeded random, ground, blob, glow stroke, terminal) replaces the private helper copies in the three existing tiles. One shell component `PortraitTile.svelte` owns the canvas, the once-per-key paint and a module cache; each effect contributes a pure `<effect>-tile.ts` module exporting `paint<Effect>Tile(ctx, intent, extras)` built from the preset's parameters and the renderer's own helpers. `EffectPresetThumbnail.svelte` maps effect type to painter through `tile-registry.ts`; Ghost and Silk receive the current prop type.

**Spec:** `docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md`. **Reference art (approved, port from these):** `docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/reference/`. The spec says one `<Effect>Thumbnail.svelte` per effect; this plan uses one shell plus one `<effect>-tile.ts` per effect instead, because the eleven Svelte files would be identical. Task 2 records that in the spec.

**Tech Stack:** Svelte 5 runes, TypeScript, Canvas 2D, Vitest (jsdom with node-canvas, `tests/config/vitest.config.ts`), pnpm, the project's worktree lifecycle (`npm run wt:finish`).

---

## Batches

Each batch is one worktree based on current local `main`, finished with the guarded merge. Create it like this (slug per batch):

```powershell
Set-Location E:/tka-platform
git worktree add E:/worktrees/tka-platform/tiles-b1 -b codex/effect-tiles-b1 main
cmd /c mklink /J "E:\worktrees\tka-platform\tiles-b1\node_modules" "E:\tka-platform\node_modules"
```

Work inside the worktree. Commit each task with explicit pathspecs (never `git add -A`). Before finishing a batch run `npm run check:fast` from the worktree once, then from `E:/tka-platform`:

```powershell
npm run wt:finish -- codex/effect-tiles-b1 --route /create
```

| Batch | Slug              | Tasks                                              |
| ----- | ----------------- | -------------------------------------------------- |
| 1     | `effect-tiles-b1` | 1 kit, 2 shell + registry + Zap, 3 Sparkle + Ghost |
| 2     | `effect-tiles-b2` | 4 Goo + Bubbles, 5 Petals + Smoke                  |
| 3     | `effect-tiles-b3` | 6 Ink + Silk, 7 Animal                             |
| 4     | `effect-tiles-b4` | 8 Pulse, 9 look copy + evidence + spec status      |

Run one focused test file with:

```powershell
npx vitest run --config tests/config/vitest.config.ts <path/to/file.test.ts>
```

Expected output for a passing file ends with `Test Files  1 passed` and `Tests  N passed`.

## File structure

All under `src/lib/shared/animation-engine/components/effects-panel/thumbnails/` unless stated.

| File                                                                                               | Responsibility                                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `tile-paint.ts` (new)                                                                              | Shared kit: sizes, `lcg`, `mulberry32`, color helpers, `ground`, `blob`, `glowStroke`, `terminal`, easing |
| `tile-paint.test.ts` (new)                                                                         | Kit invariants                                                                                            |
| `tile-registry.ts` (new)                                                                           | `effectType -> TilePainter` map and the `TilePainter` type                                                |
| `tile-registry.test.ts` (new)                                                                      | Every non-legacy preset group resolves; Frost does not                                                    |
| `tile-test-utils.ts` (new)                                                                         | `paintsDeterministically(paint, intents)` test helper                                                     |
| `PortraitTile.svelte` (new)                                                                        | Canvas shell, paint-once, module cache, active border                                                     |
| `<effect>-tile.ts` + `<effect>-tile.test.ts` (new, eleven pairs)                                   | Art direction and parameter mapping per effect                                                            |
| `look-copy.ts` (modify)                                                                            | One line per new preset                                                                                   |
| `FireThumbnail.svelte`, `CoalThumbnail.svelte`, `BloomThumbnail.svelte` (modify)                   | Import kit helpers, delete private copies                                                                 |
| `../EffectPresetThumbnail.svelte` (modify)                                                         | Dispatch through the registry, accept `propType`                                                          |
| `../EffectPresetsSection.svelte`, `../EffectsPanel.svelte`, `../EffectQuickSwitch.svelte` (modify) | Pass `propType`                                                                                           |
| `src/lib/shared/effects/renderers/ghost-2d-renderer.ts` (modify)                                   | Export treatment builder and pose blit                                                                    |
| `src/lib/shared/effects/renderers/ink-2d-renderer.ts` (modify)                                     | Export `BrushStampCache`                                                                                  |
| `src/lib/shared/effects/renderers/animal-2d-renderer.ts` (modify)                                  | Export `bodyWidth`, `resampleAlongPath`                                                                   |
| `src/lib/shared/effects/renderers/pulse-2d-renderer.ts` (modify)                                   | Lift ring, flash and charge painters to exported functions                                                |
| `docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence/` (new)                   | Picker screenshots                                                                                        |

Tile module contract (every effect):

```ts
// <effect>-tile.ts
export const <EFFECT>_TILE_SEED = 0x....;            // fixed per effect, from the reference page
export function paint<Effect>Tile(
  ctx: CanvasRenderingContext2D,
  intent: EffectConfigMap["<effect>"],              // defaults merged with the preset patch
  extras?: ...                                       // only Ghost (sprites) and Silk (prop color)
): void;
```

The painter always paints the full 720x270 frame from scratch, never reads preset ids, never calls `Math.random`.

---

### Task 1: Tile paint kit

**Files:**

- Create: `thumbnails/tile-paint.ts`
- Create: `thumbnails/tile-paint.test.ts`
- Modify: `thumbnails/FireThumbnail.svelte:36-143` (delete `Rgb`, `toRgb`, `css`, `mix`, `hexToRgb`, `lcg`, `blob`; keep `paletteOf`, `sampleTemp`)
- Modify: `thumbnails/CoalThumbnail.svelte:75-83` (delete `mulberry32`)
- Modify: `thumbnails/BloomThumbnail.svelte:55-66` (delete `withAlpha`)

- [ ] **Step 1: Write the failing kit test**

```ts
// thumbnails/tile-paint.test.ts
import { describe, expect, it } from "vitest";
import {
  TILE_H,
  TILE_W,
  blob,
  css,
  ground,
  hexToRgb,
  lcg,
  mix,
  mulberry32,
  withAlpha,
} from "./tile-paint";

describe("tile-paint kit", () => {
  it("has the tile size every portrait is drawn at", () => {
    expect([TILE_W, TILE_H]).toEqual([720, 270]);
  });

  it("seeded generators repeat for the same seed and differ across seeds", () => {
    const a = lcg(42),
      b = lcg(42),
      c = lcg(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    const m1 = mulberry32(7),
      m2 = mulberry32(7);
    expect([m1(), m1()]).toEqual([m2(), m2()]);
    for (let i = 0; i < 100; i += 1) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("converts colors the way the Fire tile did", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(hexToRgb("#f80")).toEqual([1, 136 / 255, 0]);
    expect(css([1, 0.5, 0], 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(mix([0, 0, 0], [1, 1, 1], 0.25)).toEqual([0.25, 0.25, 0.25]);
    expect(withAlpha("#ff8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(withAlpha("hsl(350, 85%, 62%)", 0.3)).toBe(
      "hsla(350, 85%, 62%, 0.3)"
    );
  });

  it("paints ground and a blob onto a real canvas", () => {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_W;
    canvas.height = TILE_H;
    const ctx = canvas.getContext("2d")!;
    ground(ctx, [0.04, 0.03, 0.05]);
    blob(ctx, 360, 135, 200, 100, [1, 0.5, 0.2], 0.8);
    const center = ctx.getImageData(360, 135, 1, 1).data;
    const corner = ctx.getImageData(2, 2, 1, 1).data;
    expect(center[0]).toBeGreaterThan(corner[0] + 40);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-paint.test.ts`
Expected: FAIL, `Cannot find module './tile-paint'`.

- [ ] **Step 3: Write the kit**

```ts
// thumbnails/tile-paint.ts
/**
 * Shared tile paint kit. Every effect portrait is a 720x270 canvas, shown at
 * about 304x114 in the picker: dark ground, additive light, every mark derived
 * from the preset's own parameters, seeded random only. Fire, Coal and Bloom
 * carried private copies of these helpers; the ported tiles share this one.
 */
export const TILE_W = 720;
export const TILE_H = 270;

export type Rgb = [number, number, number];
export const WHITE: Rgb = [1, 1, 1];

/** Stable per-tile variation: a seeded LCG, never Math.random. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The Coal tile's generator, kept so its picture does not change. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toRgb(c: readonly number[]): Rgb {
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
}

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function css(c: Rgb, alpha = 1): string {
  const [r, g, b] = c;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Alpha on a CSS color string (hex or hsl), the Bloom tile's helper. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  if (color.startsWith("#")) {
    let h = color.slice(1);
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  if (color.startsWith("hsl(")) return `hsla${color.slice(3, -1)}, ${a})`;
  return color;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(e0: number, e1: number, v: number): number {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(p: number): number {
  const q = 1 - p;
  return 1 - q * q * q;
}

/** Vertical dark gradient: tint x1.6 at the top, x0.5 at the bottom. A light tint makes the lit ground dark materials sit on. */
export function ground(
  ctx: CanvasRenderingContext2D,
  tint: Rgb = [0.04, 0.03, 0.05]
): void {
  const g = ctx.createLinearGradient(0, 0, 0, TILE_H);
  g.addColorStop(0, css(toRgb(tint.map((v) => v * 1.6))));
  g.addColorStop(1, css(toRgb(tint.map((v) => v * 0.5))));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE_W, TILE_H);
}

/** One soft light blob. Everything in a tile is made of these. */
export function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: Rgb,
  alpha: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, css(color, alpha));
  g.addColorStop(0.45, css(color, alpha * 0.42));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

export interface Point {
  x: number;
  y: number;
}

/** Glow stroke: wide colored halo under a hot core (the Zap bolt contract). */
export function glowStroke(
  ctx: CanvasRenderingContext2D,
  pts: readonly Point[],
  width: number,
  color: string,
  glow: number,
  alpha: number,
  coreColor = "#fff",
  strokeStyle: string = color
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  };
  ctx.shadowBlur = glow;
  ctx.shadowColor = color;
  ctx.strokeStyle = strokeStyle;
  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = width * 2;
  trace();
  ctx.stroke();
  ctx.shadowBlur = glow * 0.4;
  ctx.strokeStyle = coreColor;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  trace();
  ctx.stroke();
  ctx.restore();
}

/** Radiant terminal at a prop tip: white heart, colored skirt. */
export function terminal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.3, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
```

- [ ] **Step 4: Run the kit test**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-paint.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Point Fire, Coal and Bloom at the kit**

In `FireThumbnail.svelte` add `import { type Rgb, blob, css, hexToRgb, lcg, mix, toRgb } from "./tile-paint";` and delete the local `type Rgb`, `toRgb`, `css`, `mix`, `hexToRgb`, `lcg` and `blob` definitions (lines 36-143 hold them; `paletteOf` and `sampleTemp` stay). In `CoalThumbnail.svelte` add `import { mulberry32 } from "./tile-paint";` and delete its `mulberry32`. In `BloomThumbnail.svelte` add `import { withAlpha } from "./tile-paint";` and delete its `withAlpha`. The kit's bodies are byte-for-byte the originals, so the pictures do not change.

- [ ] **Step 6: Verify the three tiles still compile and paint the same**

Run: `npm run check:fast`
Expected: no new errors in the three thumbnail files.

Then, with the primary dev server at https://localhost:5173/create, open the effect picker and screenshot the Fire, Coal and Bloom rows before and after this change (DevTools MCP `take_screenshot` on the picker element). Save both to `docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence/kit-before.png` and `kit-after.png`. They must look identical.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-paint.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-paint.test.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/FireThumbnail.svelte src/lib/shared/animation-engine/components/effects-panel/thumbnails/CoalThumbnail.svelte src/lib/shared/animation-engine/components/effects-panel/thumbnails/BloomThumbnail.svelte docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
git commit -m "refactor(effects): share the tile paint kit across Fire, Coal and Bloom" -- src/lib/shared/animation-engine/components/effects-panel/thumbnails docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
```

---

### Task 2: Portrait shell, registry, dispatcher, prop threading, Zap

**Files:**

- Create: `thumbnails/PortraitTile.svelte`
- Create: `thumbnails/tile-registry.ts`, `thumbnails/tile-registry.test.ts`
- Create: `thumbnails/tile-test-utils.ts`
- Create: `thumbnails/zap-tile.ts`, `thumbnails/zap-tile.test.ts`
- Modify: `EffectPresetThumbnail.svelte`
- Modify: `EffectPresetsSection.svelte:10-48` (Props), `EffectsPanel.svelte:743-750`, `EffectQuickSwitch.svelte:351-355`
- Modify: `docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md` (architecture note)
- Reference: `reference/zap.html` (161 lines, draw code inline)

- [ ] **Step 1: Write the test helper**

```ts
// thumbnails/tile-test-utils.ts
import { expect } from "vitest";
import { TILE_H, TILE_W } from "./tile-paint";

export function makeTileCanvas(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_W;
  canvas.height = TILE_H;
  return canvas.getContext("2d")!;
}

/**
 * Every tile painter must (1) paint each preset without throwing, (2) leave
 * light on the frame, and (3) repeat itself exactly for the same inputs.
 */
export function paintsDeterministically<I>(
  paint: (ctx: CanvasRenderingContext2D, intent: I) => void,
  intents: readonly I[]
): void {
  expect(intents.length).toBeGreaterThan(0);
  for (const intent of intents) {
    const a = makeTileCanvas();
    const b = makeTileCanvas();
    expect(() => paint(a, intent)).not.toThrow();
    paint(b, intent);
    const pa = a.getImageData(0, 0, TILE_W, TILE_H).data;
    const pb = b.getImageData(0, 0, TILE_W, TILE_H).data;
    let lit = 0;
    for (let i = 0; i < pa.length; i += 4)
      if (pa[i] + pa[i + 1] + pa[i + 2] > 120) lit += 1;
    expect(lit).toBeGreaterThan(200);
    expect(Buffer.compare(Buffer.from(pa.buffer), Buffer.from(pb.buffer))).toBe(
      0
    );
  }
}
```

- [ ] **Step 2: Write the failing Zap test**

```ts
// thumbnails/zap-tile.test.ts
import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { ZAP_PRESET_GROUP } from "../presets/zap-presets";
import { paintZapTile } from "./zap-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("zap tile", () => {
  it("paints every Zap preset deterministically", () => {
    const intents = ZAP_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.zap,
      ...(p.patch ?? {}),
    }));
    paintsDeterministically(paintZapTile, intents);
  });
});
```

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/zap-tile.test.ts`
Expected: FAIL, `Cannot find module './zap-tile'`.

- [ ] **Step 3: Port the Zap painter**

Create `thumbnails/zap-tile.ts`. Port the `<script type="module">` of `reference/zap.html` as follows:

- Replace `import ... from './kit.js'` with `import { TILE_W, TILE_H, lcg, ground, blob, glowStroke, terminal, hexToRgb, css } from "./tile-paint";` (import only what the page used).
- Replace the page's `PRESETS` array and `mount()` loop with the exported painter; the page's per-preset `p` object becomes the `intent` argument:

```ts
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";

export type ZapIntent = EffectConfigMap["zap"];
export const ZAP_TILE_SEED = 0x2a9;

export function paintZapTile(
  ctx: CanvasRenderingContext2D,
  intent: ZapIntent
): void {
  const rand = lcg(ZAP_TILE_SEED);
  // ... the page's draw body, verbatim, reading intent.style, intent.jitter,
  // intent.branching, intent.frequency, intent.glow, intent.intensity and the
  // preset colors exactly as the page read them from `p`.
}
```

- Keep every constant and formula from the page. Where the page seeded per preset name (`lcg(seed + name.length * k)`), use `ZAP_TILE_SEED` alone: seeds must not depend on names.
- Type the helpers the page declared inline (`function bolt(...)`) with explicit parameter types; no `any`.

- [ ] **Step 4: Run the Zap test**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/zap-tile.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing registry test**

```ts
// thumbnails/tile-registry.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { tilePainterFor } from "./tile-registry";

const LEGACY_TILES = new Set(["trails", "fire", "led", "charcoal", "bloom"]);
const NO_TILE = new Set(["frost"]);

describe("tile registry", () => {
  it("has a portrait painter for every effect that is not legacy-tiled or retired", () => {
    for (const effectType of Object.keys(DEFAULT_EFFECTS_CONFIG)) {
      if (effectType === "version" || LEGACY_TILES.has(effectType)) continue;
      const painter = tilePainterFor(effectType);
      if (NO_TILE.has(effectType)) expect(painter).toBeNull();
      else expect(painter, effectType).not.toBeNull();
    }
  });
});
```

The effect list comes from the defaults map (its keys are `version` plus the sixteen effect types); the preset-group map in `effect-registry.ts` is a private const, so do not import it.

- [ ] **Step 6: Write the registry**

```ts
// thumbnails/tile-registry.ts
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { paintZapTile } from "./zap-tile";

/** What a tile needs beyond the merged intent. Only Ghost and Silk read it. */
export interface TileExtras {
  propType: string | null;
}

export type TilePainter<
  E extends keyof EffectConfigMap = keyof EffectConfigMap,
> = (
  ctx: CanvasRenderingContext2D,
  intent: EffectConfigMap[E],
  extras: TileExtras
) => void | Promise<void>;

const PAINTERS: Partial<{ [E in keyof EffectConfigMap]: TilePainter<E> }> = {
  zap: (ctx, intent) => paintZapTile(ctx, intent),
};

export function tilePainterFor(effectType: string): TilePainter | null {
  return (
    (PAINTERS as Record<string, TilePainter | undefined>)[effectType] ?? null
  );
}
```

Run the registry test. Expected at this point: FAIL for `sparkles`, `ghost`, `goo`, `bubbles`, `petals`, `smoke`, `ink`, `silk`, `animal`, `pulse` (painters land in later tasks). Keep the test; it goes green in Task 8 when the last painter registers. Until then run it with `-t` filters or accept the red line in the batch log and say so in the commit body.

- [ ] **Step 7: Write the shell component**

```svelte
<!-- thumbnails/PortraitTile.svelte -->
<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import type { EffectPreset } from "../presets/types";
  import { TILE_H, TILE_W } from "./tile-paint";
  import { tilePainterFor, type TileExtras } from "./tile-registry";

  interface Props {
    effectType: keyof EffectConfigMap;
    preset: EffectPreset;
    propType?: string | null;
    active?: boolean;
  }

  const {
    effectType,
    preset,
    propType = null,
    active = false,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  /** Painted frames, keyed by effect, preset and prop, so reopening the
   *  picker blits instead of repainting. Bounded: the catalog is small. */
  const cache = new Map<string, HTMLCanvasElement>();
  const CACHE_LIMIT = 96;

  function paintInto(
    target: HTMLCanvasElement,
    key: string,
    extras: TileExtras
  ): void {
    const ctx = target.getContext("2d");
    if (!ctx) return;
    const cached = cache.get(key);
    if (cached) {
      ctx.clearRect(0, 0, TILE_W, TILE_H);
      ctx.drawImage(cached, 0, 0);
      return;
    }
    const painter = tilePainterFor(effectType);
    if (!painter) return;
    const intent = {
      ...DEFAULT_EFFECTS_CONFIG[effectType],
      ...(preset.patch ?? {}),
    };
    const result = painter(ctx, intent as never, extras);
    const remember = () => {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      const copy = document.createElement("canvas");
      copy.width = TILE_W;
      copy.height = TILE_H;
      copy.getContext("2d")?.drawImage(target, 0, 0);
      cache.set(key, copy);
    };
    if (result instanceof Promise) void result.then(remember);
    else remember();
  }

  $effect(() => {
    const node = canvas;
    if (!node) return;
    paintInto(node, `${effectType}|${preset.id}|${propType ?? ""}`, {
      propType,
    });
  });
</script>

<div class="portrait-tile" class:active aria-hidden="true">
  <canvas bind:this={canvas} width={TILE_W} height={TILE_H}></canvas>
</div>

<style>
  .portrait-tile {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: #050203;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .portrait-tile.active {
    border-color: color-mix(
      in srgb,
      var(--card-accent, #f97316) 50%,
      transparent
    );
  }
</style>
```

`cache` is module-scoped on purpose: declare it with `const` at module level by moving the two lines above the `interface Props` into a `<script module lang="ts">` block (Svelte 5 syntax) so every tile shares it.

- [ ] **Step 8: Dispatch through the shell and thread the prop type**

Replace the `{:else}` fallback branch in `EffectPresetThumbnail.svelte` with:

```svelte
{:else if tilePainterFor(effectType)}
  <PortraitTile effectType={effectType as keyof EffectConfigMap} {preset} {propType} {active} />
{:else}
  <!-- Frost is the one effect left on the generic card; it is retired from
       the strip. Every other effect has a portrait in tile-registry.ts. -->
  <EffectLookPreview model={legacyModel} {active} />
{/if}
```

Add to the script: `import PortraitTile from "./thumbnails/PortraitTile.svelte";`, `import { tilePainterFor } from "./thumbnails/tile-registry";`, `import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";`, and `propType?: string | null;` to `Props` with `propType = null` in the destructure.

Thread it at the three call sites:

- `EffectPresetsSection.svelte`: add `propType?: string | null;` to `Props` (default `null`) and pass `{propType}` to `<EffectPresetThumbnail>` at line 129. Then in `EffectsPanel.svelte` find each `<EffectPresetsSection` usage and add `propType={animationSettingsState.currentPropType}` (the file already passes that expression at lines 824, 930 and 1041 to other children).
- `EffectsPanel.svelte:743-750` (`catalogPortrait` snippet): add `propType={animationSettingsState.currentPropType}`.
- `EffectQuickSwitch.svelte:351-355` (`portrait` snippet): add `propType={animationSettings.currentPropType}` and `import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";` next to the other imports (EffectsPanel imports it the same way at line 36-39).

- [ ] **Step 9: Record the shell decision in the spec**

In `docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md`, under "One tile component per effect", append: "Implementation note 2026-10-11: the eleven Svelte files would be identical, so `PortraitTile.svelte` is the one shell and each effect contributes `<effect>-tile.ts`; `tile-registry.ts` maps effect type to painter."

- [ ] **Step 10: Verify in the browser**

Run `npm run check:fast` (expected: no new errors). Open https://localhost:5173/create on the primary server (or the batch worktree's own server on a free port, never 5173), open the effect picker, confirm the Zap row shows the three bolt portraits and every other effect still shows its old card. Screenshot the Zap row to `evidence/zap.png`.

- [ ] **Step 11: Commit**

```powershell
git add src/lib/shared/animation-engine/components/effects-panel/thumbnails/PortraitTile.svelte src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-registry.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-registry.test.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-test-utils.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/zap-tile.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/zap-tile.test.ts src/lib/shared/animation-engine/components/effects-panel/EffectPresetThumbnail.svelte src/lib/shared/animation-engine/components/effects-panel/EffectPresetsSection.svelte src/lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte src/lib/shared/animation-engine/components/effects-panel/EffectQuickSwitch.svelte docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence/zap.png
git commit -m "feat(effects): portrait tile shell, registry and the Zap portrait" -- src/lib/shared/animation-engine/components/effects-panel docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
```

---

### Task 3: Sparkle and Ghost

**Files:**

- Create: `thumbnails/sparkle-tile.ts`, `thumbnails/sparkle-tile.test.ts`
- Create: `thumbnails/ghost-tile.ts`, `thumbnails/ghost-tile.test.ts`
- Modify: `src/lib/shared/effects/renderers/ghost-2d-renderer.ts` (export treatment and blit)
- Modify: `thumbnails/tile-registry.ts` (register both)
- Reference: `reference/sparkle.html` (109 lines), `reference/ghost2.html` (79 lines)

- [ ] **Step 1: Sparkle test, then port**

Write `sparkle-tile.test.ts` exactly like `zap-tile.test.ts` with `SPARKLES_PRESET_GROUP` from `../presets/sparkles-presets`, `DEFAULT_EFFECTS_CONFIG.sparkles`, and `paintSparkleTile` from `./sparkle-tile`. Run it (FAIL: module missing). Port `reference/sparkle.html`'s module script into `sparkle-tile.ts` under the tile module contract (`SPARKLE_TILE_SEED`, `paintSparkleTile(ctx, intent: EffectConfigMap["sparkles"])`), reading `intent.rate`, `intent.size`, `intent.gravity`, `intent.lifetime`, `intent.spread`, the emission mode and the color mode/palette the page read from `p`. Register `sparkles: (ctx, intent) => paintSparkleTile(ctx, intent)` in `tile-registry.ts`. Run the test: PASS.

- [ ] **Step 2: Export the ghost treatment and blit**

In `ghost-2d-renderer.ts`:

1. `export interface GhostSpriteTreatment` (line 71; currently not exported).
2. The private methods `buildTreatment` (line 227), `createTreatmentCanvas`, `buildRim` and `buildFrost` read no instance state (`this.` on them is only the method call). Move them out of the class into module functions with unchanged bodies (replace `this.createTreatmentCanvas(` with `createTreatmentCanvas(` and so on; `TreatmentCanvas` and `TreatmentSurface` are already module-level types), and export the first one:

```ts
export function buildGhostSpriteTreatment(
  image: CanvasImageSource,
  spriteWidth: number,
  spriteHeight: number
): GhostSpriteTreatment | null {
  /* former buildTreatment body, calling createTreatmentCanvas/buildRim/buildFrost */
}
```

The class's `resolveTreatment` (line 208) now calls `buildGhostSpriteTreatment(g.image, width, height)`. 3. Move `blit` (line 175) out as well:

```ts
export function blitGhostPose(
  ctx: CanvasRenderingContext2D,
  g: GhostProp,
  visual: Ghost2DAgeVisual,
  treatment: GhostSpriteTreatment | null
): void {
  /* former blit body from `ctx.save()` on; the treatment is passed in */
}
```

with `import type { Ghost2DAgeVisual } from "./ghost-chrono-frost-2d";`. The class's `blit` becomes `blitGhostPose(ctx, g, visual, this.resolveTreatment(g))`.

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/effects/renderers/ghost-2d-renderer.test.ts`
Expected: PASS (behavior unchanged).

- [ ] **Step 3: Ghost test**

```ts
// thumbnails/ghost-tile.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { makeTileCanvas } from "./tile-test-utils";
import { TILE_H, TILE_W } from "./tile-paint";
import { paintGhostTile, type GhostTileSprites } from "./ghost-tile";

function fakeSprite(fill: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 252;
  c.height = 78;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 28, 252, 22);
  return c;
}

describe("ghost tile", () => {
  const sprites: GhostTileSprites = {
    left: { image: fakeSprite("#2e3192"), width: 252, height: 78 },
    right: { image: fakeSprite("#ed1c24"), width: 252, height: 78 },
  };

  it("paints the default ghost with both sprites, deterministically", () => {
    const a = makeTileCanvas();
    const b = makeTileCanvas();
    paintGhostTile(a, DEFAULT_EFFECTS_CONFIG.ghost, sprites);
    paintGhostTile(b, DEFAULT_EFFECTS_CONFIG.ghost, sprites);
    const pa = a.getImageData(0, 0, TILE_W, TILE_H).data;
    const pb = b.getImageData(0, 0, TILE_W, TILE_H).data;
    expect(Buffer.compare(Buffer.from(pa.buffer), Buffer.from(pb.buffer))).toBe(
      0
    );
    let lit = 0;
    for (let i = 0; i < pa.length; i += 4)
      if (pa[i] + pa[i + 1] + pa[i + 2] > 120) lit += 1;
    expect(lit).toBeGreaterThan(200);
  });

  it("paints only the ground when no sprite is available", () => {
    const ctx = makeTileCanvas();
    expect(() =>
      paintGhostTile(ctx, DEFAULT_EFFECTS_CONFIG.ghost, null)
    ).not.toThrow();
  });
});
```

Run it: FAIL (module missing).

- [ ] **Step 4: Port the Ghost painter**

`ghost-tile.ts` exports:

```ts
export interface GhostTileSprite {
  image: CanvasImageSource;
  width: number;
  height: number;
}
export interface GhostTileSprites {
  left: GhostTileSprite;
  right: GhostTileSprite;
}
export const GHOST_TILE_SEED = 0x6057;

export function paintGhostTile(
  ctx: CanvasRenderingContext2D,
  intent: EffectConfigMap["ghost"],
  sprites: GhostTileSprites | null
): void;
```

Port `reference/ghost2.html`: the ground and light blob, the pose list along the sweep (positions, angles and ages as the page lays them out from `intent.decay` and `intent.interval`), and for each pose call `resolveGhost2DAgeVisual(age, resolveGhostLifetimeSeconds(intent.decay), intent.intensity)` from `#lib/shared/effects/renderers/ghost-chrono-frost-2d.js` and `#lib/shared/effects/domain/ghost-parameters.js`, then `blitGhostPose(ctx, prop, visual, treatment)` with `treatment = buildGhostSpriteTreatment(sprite.image, drawW, drawH)` (build once per sprite per paint; the page's own rim/frost cut is replaced by the renderer's exported builder). `GhostProp` for each pose: `{ id, image, centerX, centerY, angle, width: drawW, height: drawH, flipped: false }`. When `sprites` is null paint the ground only and return.

Then add the sprite loader and register:

```ts
// ghost-tile.ts (continued)
import {
  generateLeftPropSvg,
  generateRightPropSvg,
} from "#lib/shared/animation-engine/services/svg-generator.js";

const spriteCache = new Map<string, Promise<GhostTileSprites | null>>();

function decode(
  svg: string,
  width: number,
  height: number
): Promise<GhostTileSprite> {
  return new Promise((resolve, reject) => {
    const image = new Image(width, height);
    image.onload = () => resolve({ image, width, height });
    image.onerror = () =>
      reject(new Error("ghost tile sprite failed to decode"));
    image.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  });
}

/** The engine's own prop sprites for the current prop, cached per prop type. */
export function loadGhostTileSprites(
  propType: string | null
): Promise<GhostTileSprites | null> {
  const key = propType ?? "staff";
  let pending = spriteCache.get(key);
  if (!pending) {
    pending = Promise.all([generateLeftPropSvg(key), generateRightPropSvg(key)])
      .then(async ([l, r]) => ({
        left: await decode(l.svg, l.width, l.height),
        right: await decode(r.svg, r.width, r.height),
      }))
      .catch(() => null);
    spriteCache.set(key, pending);
  }
  return pending;
}
```

Registry entry:

```ts
ghost: async (ctx, intent, extras) => {
  paintGhostTile(ctx, intent, null);
  const sprites = await loadGhostTileSprites(extras.propType);
  if (sprites) paintGhostTile(ctx, intent, sprites);
},
```

`PortraitTile` already handles the returned promise (caches after it settles).

- [ ] **Step 5: Run both tile tests, check types, verify in the browser**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/sparkle-tile.test.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/ghost-tile.test.ts`
Expected: PASS, 3 tests. `npm run check:fast`: no new errors. In the picker on /create: Sparkle row shows six glint portraits; the Ghost catalog card shows the currently selected prop (switch prop to poi, reopen the picker, confirm the tile follows). Screenshot both to `evidence/sparkle.png` and `evidence/ghost.png`.

- [ ] **Step 6: Commit, then finish batch 1**

```powershell
git commit -m "feat(effects): Sparkle and Ghost portraits; export the ghost treatment and pose blit" -- src/lib/shared/animation-engine/components/effects-panel/thumbnails src/lib/shared/effects/renderers/ghost-2d-renderer.ts docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
```

(stage the same paths first with `git add`.) Then `Set-Location E:/tka-platform; npm run wt:finish -- codex/effect-tiles-b1 --route /create`.

---

### Task 4: Goo and Bubbles

**Files:**

- Create: `thumbnails/goo-tile.ts`, `thumbnails/goo-tile.test.ts`, `thumbnails/bubbles-tile.ts`, `thumbnails/bubbles-tile.test.ts`
- Modify: `thumbnails/tile-registry.ts`
- Reference: `reference/goo.html` (117 lines), `reference/bubbles.html` (162 lines)

- [ ] **Step 1: Tests first**

Write `goo-tile.test.ts` and `bubbles-tile.test.ts` with the same body as `zap-tile.test.ts`, substituting `GOO_PRESET_GROUP` (`../presets/goo-presets`, `DEFAULT_EFFECTS_CONFIG.goo`, `paintGooTile`) and `BUBBLES_PRESET_GROUP` (`../presets/bubbles-presets`, `DEFAULT_EFFECTS_CONFIG.bubbles`, `paintBubblesTile`). Run both: FAIL, modules missing.

- [ ] **Step 2: Port Goo**

`goo-tile.ts`: `GOO_TILE_SEED`, `paintGooTile(ctx, intent: EffectConfigMap["goo"])`. Port the page: the rope laid along the sweep, the metaball field pass (blur then contrast on an offscreen canvas created with `document.createElement("canvas")`), rim band in the palette edge color, specular glints, and drips, driven by `intent.motionEmission`, `intent.ambientEmission`, `intent.surfaceTension`, `intent.viscosity`, `intent.clarity`, `intent.intensity` and the palette fields the page read. The page's palette table (if inline) stays inline in the tile module as `const GOO_TILE_PALETTES`, typed; if the page imported a repo bundle, import the repo module instead.

- [ ] **Step 3: Port Bubbles**

`bubbles-tile.ts`: `BUBBLES_TILE_SEED`, `paintBubblesTile(ctx, intent: EffectConfigMap["bubbles"])`. Port the field: power-law sizes, rise by age, popped slivers, and per bubble the film, hairline rim, thin-film sheen, specular and bounce, driven by `intent.intensity`, `intent.sizeJitter`, `intent.buoyancy` and the emission and palette fields the page read. Oil rims shift magenta, cyan, gold with age exactly as the page computes them.

- [ ] **Step 4: Register, test, verify**

Add `goo: (ctx, intent) => paintGooTile(ctx, intent)` and `bubbles: (ctx, intent) => paintBubblesTile(ctx, intent)` to `PAINTERS`. Run both tests: PASS. `npm run check:fast`: clean. Picker on /create: seven Goo and six Bubbles portraits; screenshot to `evidence/goo.png`, `evidence/bubbles.png`. Time the first paint of Goo once with `performance.now()` around the painter call in the browser console (temporary, not committed); if it exceeds 8 ms, note the number in the commit body (the shell cache already covers re-opens).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/shared/animation-engine/components/effects-panel/thumbnails/goo-tile.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/goo-tile.test.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/bubbles-tile.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/bubbles-tile.test.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-registry.ts docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
git commit -m "feat(effects): Goo and Bubbles portraits" -- src/lib/shared/animation-engine/components/effects-panel/thumbnails docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
```

---

### Task 5: Petals and Smoke

**Files:**

- Create: `thumbnails/petals-tile.ts`, `thumbnails/petals-tile.test.ts`, `thumbnails/smoke-tile.ts`, `thumbnails/smoke-tile.test.ts`
- Modify: `thumbnails/tile-registry.ts`
- Reference: `reference/petals.html` (112 lines; imports the bundle of `src/lib/shared/effects/domain/petal-palettes.ts`), `reference/smoke3.html` (146 lines; imports the bundle of `src/lib/shared/3d/effects/smoke/smoke-curl-field.ts`)

- [ ] **Step 1: Tests first**

`petals-tile.test.ts` and `smoke-tile.test.ts` as in Task 4 with `PETALS_PRESET_GROUP` / `paintPetalsTile` and `SMOKE_PRESET_GROUP` / `paintSmokeTile`. Run: FAIL.

- [ ] **Step 2: Port Petals**

`petals-tile.ts` imports `PETAL_PALETTES, drawPetalSilhouette, drawPetalEmberRim, pickPetalSprite, pickPetalTint, resolvePetalOpacity, resolvePetalSize, rollEmberFlag, resolvePetalPalette` from `#lib/shared/effects/domain/petal-palettes.js` (the page imported the same names from its bundle) and ports the page's leaf field: launch along the sweep with carry of tip speed, bleed-off at the streak rate, ease into the fall, face flutter turning some edge-on, sizes from `intent.intensity`, count from the emission field the page read. Use `resolvePetalPalette(intent)` where the page indexed `PETAL_PALETTES` by the intent's palette id.

- [ ] **Step 3: Port Smoke**

`smoke-tile.ts` imports `curl2D` from `#lib/shared/3d/effects/smoke/smoke-curl-field.js` and ports `smoke3.html` verbatim: `SOURCE`, the arc sweep, the spine bent by `curl2D` with the `tanh(flow / (risePx + 80)) * dy * 0.7` term and the sine wobble, column count `220 + ambient * 160 + intensity * 60`, trail count `60 + motion * 220`, the puff gradient (core 0.8, edge 0.38 at 0.5, 0 at 1), the dark boost 1.7 / 0.8, and the lit ground for dark palettes. Replace the page's palette table with `resolveSmokePalette(intent)` from `#lib/shared/effects/domain/smoke-palettes.js` (the page's entries were copied from `SMOKE_PALETTES` there); the page's per-palette lifetime hint, if it has no field in `SmokePalette`, stays in the module as a typed constant keyed by palette id.

- [ ] **Step 4: Register, test, verify, commit**

Register `petals` and `smoke`. Run both tests: PASS. `npm run check:fast`: clean. Picker: six Petals and six Smoke portraits (Cursed on its lit ground). Screenshots to `evidence/petals.png`, `evidence/smoke.png`. Commit with the same pathspec form as Task 4, message `feat(effects): Petals and Smoke portraits`. Then finish batch 2: `npm run wt:finish -- codex/effect-tiles-b2 --route /create`.

---

### Task 6: Ink and Silk

**Files:**

- Create: `thumbnails/ink-tile.ts`, `thumbnails/ink-tile.test.ts`, `thumbnails/silk-tile.ts`, `thumbnails/silk-tile.test.ts`
- Modify: `src/lib/shared/effects/renderers/ink-2d-renderer.ts:98` (`export class BrushStampCache`)
- Modify: `thumbnails/tile-registry.ts`
- Reference: `reference/ink.html` (310 lines), `reference/silk-draw.js` (155 lines) with `reference/silk-entry.ts` naming the repo exports it uses

- [ ] **Step 1: Tests first**

`ink-tile.test.ts` as in Task 4 (`INK_PRESET_GROUP`, `paintInkTile`). `silk-tile.test.ts`:

```ts
import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { SILK_PRESET_GROUP } from "../presets/silk-presets";
import { paintSilkTile } from "./silk-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("silk tile", () => {
  it("paints every Silk preset deterministically with the default prop color", () => {
    const intents = SILK_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.silk,
      ...(p.patch ?? {}),
    }));
    paintsDeterministically(
      (ctx, intent) => paintSilkTile(ctx, intent, "#2e3192"),
      intents
    );
  });
});
```

Run both: FAIL.

- [ ] **Step 2: Export the stamp cache and port Ink**

Change line 98 of `ink-2d-renderer.ts` to `export class BrushStampCache {`. The renderer's ribbon, stamp, bristle and droplet passes are instance methods bound to tip state (`drawSumiRibbon`, `drawDenseInkRibbon`, `buildRibbon`, `drawGranulation`, `drawBristleBreakup`, `drawDroplets`), so the tile keeps the standalone port the reference page already made of them: `ink-tile.ts` ports `ink.html`'s module script (`SCALE 2.6`, `baseSpeed 150 * SCALE`, the Catmull-Rom loop `KNOTS`, the width-from-speed rule using `resolveInkStrokeWidth`, `resolveInkTurnLoad` and `resolveInkNibWidth` imported from `#lib/shared/effects/renderers/ink-2d-renderer.js`, the four-pass pigment body, wet gloss, source-atop grain via `new BrushStampCache().get(params)`, dry-bristle cuts, neon additive path, splatter bursts, Toxic droplets). Record in the spec's "Reuse and exports" table that Ink's painters are a port, not an export, because they are instance-bound.

- [ ] **Step 3: Port Silk**

`silk-tile.ts` imports `resolveSilk2DWidthEnvelope, smoothSilk2DPath, resolveSilk2DMaterialColors, resolveSilk2DMaximumLength, resolveSilk2DSampleSpacing` from `#lib/shared/effects/renderers/silk-2d-renderer.js` and `traceForward, traceBackward, traceCentripetalForward, traceCentripetalBackward` from `#lib/shared/effects/renderers/ribbon-trace.js`, then ports `silk-draw.js`: `DEFAULT_KNOTS` spiral, `recordTrail` keeping `total * (0.6 + 0.4 * intent.duration)` from the head, `SCALE 2`, `TIME 3.7`, the shadow band x1.6, sheen x1.5 and left selvedge x1.5 boosts, and the lit ground when the body luminance is under 0.1 and the material is not emissive. Signature: `paintSilkTile(ctx, intent: EffectConfigMap["silk"], propColor: string)`; the page's `PROP_COLOR` becomes the argument.

Prop color for the registry: the left hand's trail color is what satin borrows on stage. Resolve it the way the quick switch resolves hand colors elsewhere in `effects-panel` (search `rg "leftColor|propColors" src/lib/shared/animation-engine/components/effects-panel --glob '*.ts'`), and if no shared resolver exists, read `DEFAULT_EFFECTS_CONFIG.trails` left color. Registry entry: `silk: (ctx, intent, extras) => paintSilkTile(ctx, intent, resolveSilkTilePropColor(extras.propType))` with `resolveSilkTilePropColor` defined in `silk-tile.ts` returning that color (the prop type is accepted for parity with Ghost and reserved for props whose sprite color differs from the hand color; today every prop uses the hand color).

- [ ] **Step 4: Test, verify, commit**

Run both tests: PASS. `npm run check:fast`: clean. Picker: three Ink swashes, six Silk ribbons (Phantom on the lit ground). Screenshots to `evidence/ink.png`, `evidence/silk.png`. Commit:

```powershell
git commit -m "feat(effects): Ink and Silk portraits; export BrushStampCache" -- src/lib/shared/animation-engine/components/effects-panel/thumbnails src/lib/shared/effects/renderers/ink-2d-renderer.ts docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
```

---

### Task 7: Animal

**Files:**

- Create: `thumbnails/animal-tile.ts`, `thumbnails/animal-tile.test.ts`
- Modify: `src/lib/shared/effects/renderers/animal-2d-renderer.ts:712,730` (export `bodyWidth`, `resampleAlongPath`)
- Modify: `thumbnails/tile-registry.ts`
- Reference: `reference/animal-draw.js` (422 lines)

- [ ] **Step 1: Test first**

`animal-tile.test.ts` as in Task 4 (`ANIMAL_PRESET_GROUP` from `../presets/animal-presets`, `paintAnimalTile`). Run: FAIL.

- [ ] **Step 2: Export the two path helpers**

In `animal-2d-renderer.ts` prefix `function bodyWidth(` (line 712) and `function resampleAlongPath(` (line 730) with `export`. Run `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/effects/renderers/animal-2d-renderer.test.ts`: PASS.

- [ ] **Step 3: Port the creature**

`animal-tile.ts`: `ANIMAL_TILE_SEED`, `paintAnimalTile(ctx, intent: EffectConfigMap["animal"])`. Port `animal-draw.js` with these substitutions: `bodyWidth` and `resampleAlongPath` imported from the renderer instead of the page's copies; the page's `PAL` table (line 5, indexed at lines 235 and 406 as `PAL[p.palette]`) replaced by `resolveAnimalPalette(intent)` from `#lib/shared/effects/domain/animal-palettes.js` (the page's hex values are that registry's); `traceForward`/`traceBackward` from `#lib/shared/effects/renderers/ribbon-trace.js`. Keep verbatim: `SCALE 2.8`, `LENGTH_SCALE 1.35`, `SEGMENTS 56`, `WAVENUMBER 0.045`, `SLITHER_SPEED 3.2`, `WHISKER_NODES 6`, `AURA_STRIDE 8`, `TIME 2.35`, `vis = max(i, 0.62)`, `TONGUE_PHASE 0.27`, `DEFAULT_KNOTS` (the coil), `densePath`, `geometry` (amplitude `slither * 20 * (1 + (scale - 1) * 0.5)`), `findCrossing`, `drawBody`, `drawCreature` with the clipped depth-ordered redraw, `whiskersAlong`, `drawHead`, `stage` (fit zoom capped at 1.45), and `draw` (lit ground when not emissive and body luminance under 0.08; creature on a transparent layer composited `lighter` when emissive). The painters stay a port, like Ink's, because the renderer's are instance-bound; record that in the spec's exports table.

- [ ] **Step 4: Register, test, verify, commit**

Register `animal`. Run the test: PASS. `npm run check:fast`: clean. Picker: six creatures, Whisper on the lit ground, Gilt Wyrm's neck crossing over its coil without a seam. Screenshot to `evidence/animal.png`. Commit:

```powershell
git commit -m "feat(effects): Animal portrait; export bodyWidth and resampleAlongPath" -- src/lib/shared/animation-engine/components/effects-panel/thumbnails src/lib/shared/effects/renderers/animal-2d-renderer.ts docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
```

Then finish batch 3: `npm run wt:finish -- codex/effect-tiles-b3 --route /create`.

---

### Task 8: Pulse

**Files:**

- Create: `thumbnails/pulse-tile.ts`, `thumbnails/pulse-tile.test.ts`
- Modify: `src/lib/shared/effects/renderers/pulse-2d-renderer.ts` (lift `drawRing`, `drawFlash`, `drawCharge`; export `PulseRing`, `ChargeTip`)
- Modify: `thumbnails/tile-registry.ts`
- Reference: `reference/pulse-draw.js` (279 lines)

- [ ] **Step 1: Test first**

`pulse-tile.test.ts` as in Task 4 (`PULSE_PRESET_GROUP` from `../presets/pulse-presets`, `paintPulseTile`). Run: FAIL.

- [ ] **Step 2: Lift the three painters**

In `pulse-2d-renderer.ts`:

1. `export interface PulseRing` and `export interface ChargeTip` (lines 30 and 58).
2. Move the bodies of the private methods `drawRing` (line 293), `drawFlash` (line 396) and `drawCharge` (line 440) into module-level exported functions, adding a `lineUnit` parameter that defaults to `unit` so the renderer's picture is unchanged:

```ts
export function drawPulseRing(
  ctx: CanvasRenderingContext2D,
  r: PulseRing,
  params: Pulse2DParams,
  unit: number,
  lineUnit: number = unit
): void;
export function drawPulseFlash(
  ctx: CanvasRenderingContext2D,
  r: PulseRing,
  params: Pulse2DParams,
  size: number,
  unit: number,
  lineUnit: number = unit
): void;
export function drawPulseCharge(
  ctx: CanvasRenderingContext2D,
  tip: ChargeTip,
  params: Pulse2DParams,
  charge: { shape: number; strength: number },
  unit: number,
  lineUnit: number = unit
): void;
```

Inside, radii keep `unit` (`maxRadius * unit`, `R = 2 * unit + ...`, drift, flash radius, charge closing radius) and widths use `lineUnit` (`frontWidth`, `band`, the stroke-style `lineWidth`s, chromatic `off`, glint `lineWidth`, charge ring `lineWidth` and core radius). Check each `* unit` against the reference `pulse-draw.js`, which marks every width use as `LINE` and every radius as `UNIT`; follow that split exactly. The class methods become one-line delegates passing `unit` for both. 3. Export `rotateHue` (line 488) so the tile builds the same warm/cool colors.

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/effects/renderers/pulse-2d-renderer.test.ts`: PASS.

- [ ] **Step 3: Port the staging**

`pulse-tile.ts`: `PULSE_TILE_SEED`, `paintPulseTile(ctx, intent: EffectConfigMap["pulse"])`. Port `pulse-draw.js`: `UNIT 0.8`, `LINE = UNIT * 2.4`, `BEAT 1.0`, `FULL_ENERGY_TRAVEL 640`, `MOTION_SMOOTHING 0.07`, `SWING_PROMINENCE 0.08`, `DT 1/60`, `LIFE_BOOST 2.2`, `FREEZE_AFTER { beat: 0.72, velocity: 0.2, continuous: 0.32 }`, `INTENSITY_FLOOR 0.55`, `STAFF_HALF 68`, `SWEEP`, `OMEGA`, `centreAt`, `tipsAt`, `TipMotion`, `Sim` (clock starts at -0.35, `ringBeat` -1), `simulate`, and `draw`. Replace the page's `PAL` (line 4, read at line 251 as `PAL[p.palette]`) with `resolvePulsePalette(intent)` from `#lib/shared/effects/domain/pulse-palettes.js` (the page's values are that registry's), and the page's own `drawRing`/`drawFlash`/`drawCharge`/`rotateHue` with the exported renderer functions called as `drawPulseRing(c, r, params, UNIT, LINE)` etc., where `params` is the page's `sim.params` shaped as `Pulse2DParams` (`colorMode: "solid"`, `resolvedPalette`, `maxRadius`, `ringWidth`, the intent fields; mirror `resolvePulse2D` in `src/lib/shared/effects/translators/canvas2d-translator.ts` for the two derived fields). The ring records the tile builds must match `PulseRing` field for field. Use the kit's `smoothstep`, `easeOutCubic`, `clamp01`. Seed: the page used `rand() * TAU` for the staff phase; use `lcg(PULSE_TILE_SEED)`.

- [ ] **Step 4: Register, test, verify, commit**

Register `pulse`. Run the tile test and `tile-registry.test.ts`: both PASS (the registry test turns green here). `npm run check:fast`: clean. Picker: Sonar two beats of blue rings, Shockwave's orange bang with the yellow fringe, Heartbeat's inner overtone, Ripple's stream. Screenshot to `evidence/pulse.png`. Commit:

```powershell
git commit -m "feat(effects): Pulse portrait; lift the ring, flash and charge painters" -- src/lib/shared/animation-engine/components/effects-panel/thumbnails src/lib/shared/effects/renderers/pulse-2d-renderer.ts docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence
```

---

### Task 9: Look copy, evidence set, spec status

**Files:**

- Modify: `thumbnails/look-copy.ts`
- Create: `docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence/README.md`
- Modify: `docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md` (frontmatter)

- [ ] **Step 1: Add the copy**

Append to `LOOK_DESCRIPTIONS` in `look-copy.ts` (adjust a line only if its tile reads differently; never describe parameter values):

```ts
  // Zap
  "zap-storm": "Forking bolts, ghost strikes",
  "zap-tesla": "One clean arc, wide halo",
  "zap-web": "Fine crackle between the tips",

  // Sparkle
  "sparkles-fairy-dust": "Soft gold motes drifting down",
  "sparkles-confetti": "Bright flecks in many colors",
  "sparkles-prism": "Sharp white glints",
  "sparkles-starfall": "Long-armed stars falling",
  "sparkles-glitter": "Dense tiny glints on the path",
  "sparkles-aurora": "Glints shifting through the rainbow",

  // Goo
  "goo-classic": "Green rope with hanging drips",
  "goo-fountain": "Oozing body, many drips",
  "goo-whip": "Thin fast rope, few drips",
  "goo-mercury": "Bright chrome liquid",
  "goo-acid": "Glowing green, dark interior",
  "goo-blood": "Dark red, slow heavy drips",
  "goo-spirit": "Pale translucent ooze",

  // Bubbles
  "bubbles-classic": "Clear bubbles rising",
  "bubbles-fizz": "Many small bubbles",
  "bubbles-dream": "Few big slow bubbles",
  "bubbles-iridescent": "Oil-sheen rims",
  "bubbles-acid": "Green-lit bubbles",
  "bubbles-spirit": "Faint pale bubbles",

  // Petals
  "petals-classic": "Pink blossoms on the breeze",
  "petals-storm": "Autumn leaves thrown wide",
  "petals-jungle": "Big green leaves",
  "petals-ember": "Charred flakes, ember rims",
  "petals-gilded": "Gold leaves drifting",
  "petals-tornado": "Leaves whipped into a spiral",

  // Smoke
  "smoke-classic": "Grey plume rising",
  "smoke-fog-wall": "Low heavy blanket",
  "smoke-genie-burst": "Tall fast column",
  "smoke-cursed": "Black smoke on a lit ground",
  "smoke-spirit-veil": "Thin pale veil",
  "smoke-campfire": "Warm slow plume",

  // Ink
  "ink-toxic": "Green swash shattering to drops",
  "ink-neon-tag": "Glowing additive stroke",
  "ink-splatter": "Black swash with bursts",

  // Silk
  "silk-classic": "Satin ribbon in the hand color",
  "silk-streamer": "Long light streamer",
  "silk-whip": "Short taut cloth",
  "silk-royal": "Deep velvet, gold sheen",
  "silk-inferno": "Ember cloth with an aura",
  "silk-phantom": "Shadow ribbon on a lit ground",

  // Animal
  "animal-wisp": "Pale ethereal snake",
  "animal-whisper": "Shadow snake on a lit ground",
  "animal-serpent": "Velvet serpent, long coil",
  "animal-ember-drake": "Glowing dragon with whiskers",
  "animal-gilt-wyrm": "Gold dragon, longest coil",
  "animal-inchworm": "Plump caterpillar with legs",

  // Pulse
  "pulse-sonar": "Blue rings on the beat",
  "pulse-shockwave": "Orange bang at the swing peak",
  "pulse-heartbeat": "Tight double ring, charging",
  "pulse-ripple": "Stream of small rings",
```

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/animation-engine/components/effects-panel/presets/preset-data.test.ts` (shape guard still passes) and `npm run check:fast`.

- [ ] **Step 2: Evidence set**

With the primary server (after batches 1 to 3 merged) or the batch 4 worktree server, on https://localhost:5173/create: open the quick-switch picker and the Effects panel catalog, in dark and light theme, and screenshot every effect row at the picker's own size (DevTools MCP `take_screenshot` of the picker element, viewport 1280x800 and 390x844). Save as `evidence/picker-<effect>-<theme>.png` and write `evidence/README.md` listing each file next to its reference page, with one line per tile saying whether it matches the prototype and any deliberate difference. Compare `kit-before.png` and `kit-after.png` side by side and state the result.

- [ ] **Step 3: Spec status**

Update the spec frontmatter: `work_state: verification`, `plan_path: "docs/superpowers/plans/active/2026-10-11-effect-tile-portraits.md"`, `remaining: "Austen reviews the evidence set; then move to shipped."`, `last_triaged` to the day's date. Run `npm run specs:check`: `0 invalid`.

- [ ] **Step 4: Commit and finish batch 4**

```powershell
git add src/lib/shared/animation-engine/components/effects-panel/thumbnails/look-copy.ts docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/evidence docs/superpowers/specs/active/2026-10-11-effect-tile-portraits-design.md
git commit -m "feat(effects): look copy for every portrait preset; tile evidence set" -- src/lib/shared/animation-engine/components/effects-panel/thumbnails/look-copy.ts docs/superpowers/specs/active/2026-10-11-effect-tile-portraits
```

Then `npm run wt:finish -- codex/effect-tiles-b4 --route /create`. After the merge, one `opus` review of the whole feature against the spec and the reference pages; fix what it finds inline and rerun the tile tests (`npx vitest run --config tests/config/vitest.config.ts src/lib/shared/animation-engine/components/effects-panel/thumbnails`).

---

## Self-review notes

- Spec coverage: kit (Task 1), per-effect modules and shell (Tasks 2 to 8), dispatcher and Frost fallback (Task 2), prop threading for Ghost and Silk (Tasks 2, 3, 6), caching (Task 2 shell), look copy (Task 9), renderer exports (Tasks 3, 6, 7, 8), tests and evidence (every task plus Task 9), batches and routing (header). Deviations from the spec are recorded in the spec itself by Tasks 2, 6 and 7.
- Names used across tasks: `paint<Effect>Tile`, `tilePainterFor`, `TilePainter`, `TileExtras`, `paintsDeterministically`, `makeTileCanvas`, `buildGhostSpriteTreatment`, `blitGhostPose`, `GhostTileSprites`, `loadGhostTileSprites`, `drawPulseRing`, `drawPulseFlash`, `drawPulseCharge`, `resolveSilkTilePropColor`.
