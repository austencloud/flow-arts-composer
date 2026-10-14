# MandalaLoader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cheesy Sims-style boot flavor text with a calm bar, and add a reusable in-app `MandalaLoader` that renders a live, undulating TKA mandala crossfading through a small pool of locally-generated sequences.

**Architecture:** Reuse `SequenceMandala` for rendering and `GenerationOrchestrator` for client-side generation. A new `mandala-pool` service keeps a small bounded pool of generated sequences in a new Dexie store (drop-oldest at cap), seeded live on first run and topped up during idle. `MandalaLoader.svelte` draws from the pool and crossfades between sequences with Svelte's `fade`. First adopters: a new `LoadingGate variant="mandala"` and the Create module-load skeleton.

**Tech Stack:** Svelte 5 (runes), Dexie (IndexedDB), Vitest, `svelte/transition`.

**Spec:** `docs/superpowers/specs/2026-06-26-mandala-loader-design.md`

### Deviation from spec (intentional)

The spec called for a baked JSON seed of ~6 pre-generated sequences for the first-ever cold load. Hand-authoring valid `SequenceData` fixtures is fragile and error-prone. Instead, the pool **seeds itself live on first run**: when the store is empty, the loader shows a thin `IndeterminateBar` while the pool generates a starter batch (one-time, ~1s), then renders mandalas. Every later session reads the warm Dexie pool and paints instantly. No fixture file to maintain. Flagged for Austen.

---

## File Structure

**Create:**
- `src/lib/shared/mandala/domain/mandala-palette.ts` — pure flow-color helpers extracted from the viewer controller.
- `src/lib/shared/mandala/domain/__tests__/mandala-palette.test.ts`
- `src/lib/shared/mandala/domain/mandala-loader-config.ts` — the generation recipe + look defaults (Austen's knobs).
- `src/lib/shared/mandala/services/mandala-pool.svelte.ts` — bounded pool service (Dexie-backed; live seed + idle top-up).
- `src/lib/shared/mandala/services/__tests__/mandala-pool.test.ts`
- `src/lib/shared/mandala/components/MandalaLoader.svelte` — the loader component.
- `src/routes/test/mandala-loader/+page.svelte` — visual verification route.

**Modify:**
- `src/lib/shared/persistence/domain/constants/database_constants.ts` — bump version 7→8, add `generatedMandalaPool` store.
- `src/lib/shared/persistence/database/tka-database.ts` — declare the new table + include it in clear/info helpers.
- `src/lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.ts` — import palette helpers instead of inline copies (behavior unchanged).
- `src/app.html` — remove the 23-line flavor array + shuffle; one quiet line.
- `src/lib/shared/components/loading/LoadingGate.svelte` — add `variant="mandala"`.
- `src/lib/shared/modules/skeletons/ModuleSkeleton.svelte` — render `MandalaLoader` for `create`.

---

## Task 1: Extract flow-color palette helpers

The viewer controller (`mandala-viewer-controller.svelte.ts`) inlines `PRESET_COLORS`, color math, and `sampleGradient`. The loader needs the same math. Extract to a shared pure module so it is not duplicated, and guard the extraction with a parity test against the controller's current output.

**Files:**
- Create: `src/lib/shared/mandala/domain/mandala-palette.ts`
- Test: `src/lib/shared/mandala/domain/__tests__/mandala-palette.test.ts`
- Modify: `src/lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.ts`

- [ ] **Step 1: Write the failing parity test**

`src/lib/shared/mandala/domain/__tests__/mandala-palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PRESET_COLORS,
  sampleGradient,
  mixColors,
  flowPalette,
  flowGradientColors,
} from "../mandala-palette";

describe("mandala-palette", () => {
  it("PRESET_COLORS exposes the named presets with pair + morph", () => {
    for (const id of ["aurora", "neon", "ember", "twilight", "ice", "solar"] as const) {
      expect(PRESET_COLORS[id].pair).toHaveLength(2);
      expect(PRESET_COLORS[id].morph.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("sampleGradient interpolates within a morph ramp", () => {
    const colors = ["#000000", "#ffffff"];
    expect(sampleGradient(colors, 0)).toBe("#000000");
    expect(sampleGradient(colors, 1)).toBe("#ffffff");
    expect(sampleGradient(colors, 0.5)).toBe("#7f7f7f");
  });

  it("flowPalette reproduces the controller's flow-mode palette math", () => {
    // Mirrors the controller's palette derived (flow branch) for aurora @ phase 0.
    const morph = PRESET_COLORS.aurora.morph;
    const c1 = sampleGradient(morph, 0);
    const c2 = sampleGradient(morph, 0.4);
    const pal = flowPalette(morph, 0);
    expect(pal.blueStroke).toBe(c1);
    expect(pal.redStroke).toBe(c2);
    expect(pal.purpleStroke).toBe(mixColors(c1, c2));
  });

  it("flowGradientColors reproduces the controller's gradientColors math", () => {
    const morph = PRESET_COLORS.aurora.morph;
    const c1 = sampleGradient(morph, 0.25);
    const c2 = sampleGradient(morph, (0.25 + 0.4) % 1);
    const c3 = sampleGradient(morph, (0.25 + 0.7) % 1);
    const g = flowGradientColors(morph, 0.25);
    expect(g.blue).toEqual([c1, c3]);
    expect(g.red).toEqual([c2, c1]);
    expect(g.purple).toEqual([mixColors(c1, c2), c3]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/shared/mandala/domain/__tests__/mandala-palette.test.ts`
Expected: FAIL — cannot find module `../mandala-palette`.

- [ ] **Step 3: Create the palette module**

`src/lib/shared/mandala/domain/mandala-palette.ts`:

```ts
/**
 * Pure flow-color helpers for mandala rendering. Extracted from
 * MandalaViewerController so the controller and the MandalaLoader share one
 * source of truth for preset colors and gradient interpolation.
 */
import type { MandalaPalette, MandalaPresetId } from "./mandala-types";

export const PRESET_COLORS: Record<
  Exclude<MandalaPresetId, "custom">,
  { pair: [string, string]; morph: string[] }
> = {
  aurora: { pair: ["#00e5ff", "#76ff03"], morph: ["#00e5ff", "#76ff03", "#7c4dff", "#ff4081", "#00e5ff"] },
  neon: { pair: ["#ff0099", "#00ddff"], morph: ["#ff0099", "#7928ca", "#0055ff", "#00ddff", "#ff0099"] },
  ember: { pair: ["#ff3d00", "#ffd600"], morph: ["#ff3d00", "#ff9100", "#ffd600", "#ff6d00", "#ff3d00"] },
  twilight: { pair: ["#aa00ff", "#f50057"], morph: ["#311b92", "#aa00ff", "#f50057", "#ff6d00", "#311b92"] },
  ice: { pair: ["#4dd0e1", "#b388ff"], morph: ["#e0f7fa", "#4dd0e1", "#1a237e", "#b388ff", "#e0f7fa"] },
  solar: { pair: ["#ffab00", "#dd2c00"], morph: ["#ffab00", "#ff6d00", "#dd2c00", "#ffea00", "#ffab00"] },
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function mixColors(a: string, b: string): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(Math.round((ar + br) / 2), Math.round((ag + bg) / 2), Math.round((ab + bb) / 2));
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  );
}

export function sampleGradient(colors: string[], t: number): string {
  const segments = colors.length - 1;
  const scaled = t * segments;
  const idx = Math.min(Math.floor(scaled), segments - 1);
  const frac = scaled - idx;
  return lerpColor(colors[idx]!, colors[idx + 1]!, frac);
}

/** Flow-mode stroke/fill palette for a morph ramp at a phase in [0,1). */
export function flowPalette(morphColors: string[], phase: number): MandalaPalette {
  const c1 = sampleGradient(morphColors, phase);
  const c2 = sampleGradient(morphColors, (phase + 0.4) % 1);
  const mix = mixColors(c1, c2);
  return {
    blueStroke: c1, blueFill: withAlpha(c1, 0.15),
    redStroke: c2, redFill: withAlpha(c2, 0.15),
    purpleStroke: mix, purpleFill: withAlpha(mix, 0.2),
  };
}

/** Per-path gradient endpoints for a morph ramp at a phase in [0,1). */
export function flowGradientColors(
  morphColors: string[],
  phase: number,
): { blue: [string, string]; red: [string, string]; purple: [string, string] } {
  const c1 = sampleGradient(morphColors, phase);
  const c2 = sampleGradient(morphColors, (phase + 0.4) % 1);
  const c3 = sampleGradient(morphColors, (phase + 0.7) % 1);
  const mix = mixColors(c1, c2);
  return {
    blue: [c1, c3],
    red: [c2, c1],
    purple: [mix, c3],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/shared/mandala/domain/__tests__/mandala-palette.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor the controller to import the helpers**

In `src/lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.ts`:

1. Delete the inline `PRESET_COLORS` (lines ~96–106), `hexToRgb`, `rgbToHex`, `mixColors`, `withAlpha`, `lerpColor`, `sampleGradient` (lines ~108–144).
2. Add the import near the top:

```ts
import {
  PRESET_COLORS,
  mixColors,
  withAlpha,
  sampleGradient,
} from "$lib/shared/mandala/domain/mandala-palette";
```

(Leave the `palette`, `gradientColors`, `previewGradient`, `#getPresetPair`, `#getPresetMorph` methods as-is — they now call the imported helpers. Do not change their logic.)

- [ ] **Step 6: Verify the controller still type-checks**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i mandala-viewer-controller`
Expected: no errors referencing `mandala-viewer-controller`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/mandala/domain/mandala-palette.ts src/lib/shared/mandala/domain/__tests__/mandala-palette.test.ts src/lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.ts
git commit -m "refactor(mandala): extract flow-color palette helpers to shared module" -- src/lib/shared/mandala/domain/mandala-palette.ts src/lib/shared/mandala/domain/__tests__/mandala-palette.test.ts src/lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.ts
```

---

## Task 2: De-cheese the cold boot loader

Remove the 23-line Sims flavor array and its Fisher-Yates shuffle; show one quiet line. Keep the real resource-tracking bar and the `__tkaReadyMessages`.

**Files:**
- Modify: `src/app.html` (lines ~848–918)

- [ ] **Step 1: Replace the flavor array + shuffle**

In `src/app.html`, replace the block from `// Sims-style flavor text - shuffled each load for variety` through the end of the Fisher-Yates loop (the `for (var i = __tkaFlavorMessages.length - 1; ...)` block, ending at its closing `}`) with:

```js
      // Single calm status line. No rotating jokes — the real bar below tracks
      // actual resource load. (Replaced the old Sims-style flavor reel.)
      var __tkaFlavorMessages = ["Loading the alphabet…"];
```

Leave `__tkaReadyMessages` and everything after it unchanged. `__tkaFlavorIndex`, `__tkaCrossfade`, and the initial-text block keep working with a single-element array (the index just never advances past it).

- [ ] **Step 2: Verify the boot loader still parses + serves**

Run: `npm run build:fast 2>&1 | tail -20`
Expected: build completes with no error in `app.html` / index generation.

- [ ] **Step 3: Commit**

```bash
git add src/app.html
git commit -m "fix(boot): replace 23-line Sims flavor reel with one calm status line" -- src/app.html
```

---

## Task 3: Add the Dexie pool store (v7 → v8)

**Files:**
- Modify: `src/lib/shared/persistence/domain/constants/database_constants.ts`
- Modify: `src/lib/shared/persistence/database/tka-database.ts`

- [ ] **Step 1: Bump version + register the store in constants**

In `database_constants.ts`:

1. Change `export const DATABASE_VERSION = 7;` to `export const DATABASE_VERSION = 8;` and add a version-8 doc line above it:

```ts
 * Version 8: Added generatedMandalaPool — bounded pool of locally-generated
 *            sequences for the in-app MandalaLoader (drop-oldest at cap).
```

2. In `TABLE_NAMES`, add:

```ts
  // Mandala loader pool (v8)
  GENERATED_MANDALA_POOL: "generatedMandalaPool",
```

3. In `TABLE_INDEXES`, add:

```ts
  // Mandala loader pool (v8) — id is a supplied uuid, not auto-increment
  [TABLE_NAMES.GENERATED_MANDALA_POOL]: "id, generatedAt",
```

- [ ] **Step 2: Declare the table type + helpers in the DB class**

In `tka-database.ts`:

1. Add the import near the other domain imports:

```ts
import type { GeneratedMandalaEntry } from "$lib/shared/mandala/domain/mandala-pool-types";
```

2. Add the table field after `galleryCacheMeta`:

```ts
  // Mandala loader pool (v8)
  generatedMandalaPool!: EntityTable<GeneratedMandalaEntry, "id">;
```

3. In `clearAllData()` add `db.generatedMandalaPool` to the transaction array and `await db.generatedMandalaPool.clear();` to the body.
4. In `getDatabaseInfo()` add `generatedMandalaPool: await db.generatedMandalaPool.count(),` to the returned object and its type.

- [ ] **Step 3: Create the entry type**

Create `src/lib/shared/mandala/domain/mandala-pool-types.ts`:

```ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/** One generated sequence held in the bounded MandalaLoader pool. */
export interface GeneratedMandalaEntry {
  /** Supplied uuid (crypto.randomUUID()), not auto-increment. */
  readonly id: string;
  /** Plain, structured-cloneable sequence data (JSON round-tripped on insert). */
  readonly sequence: SequenceData;
  /** Epoch ms — drives drop-oldest eviction. */
  readonly generatedAt: number;
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -iE "tka-database|database_constants|mandala-pool-types"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/persistence/domain/constants/database_constants.ts src/lib/shared/persistence/database/tka-database.ts src/lib/shared/mandala/domain/mandala-pool-types.ts
git commit -m "feat(persistence): add generatedMandalaPool Dexie store (v8)" -- src/lib/shared/persistence/domain/constants/database_constants.ts src/lib/shared/persistence/database/tka-database.ts src/lib/shared/mandala/domain/mandala-pool-types.ts
```

---

## Task 4: The loader config (recipe + look)

**Files:**
- Create: `src/lib/shared/mandala/domain/mandala-loader-config.ts`

- [ ] **Step 1: Create the config (Austen's knobs)**

`src/lib/shared/mandala/domain/mandala-loader-config.ts`:

```ts
/**
 * MandalaLoader configuration — the parameters Austen chooses.
 *
 * RECIPE drives which sequences the pool generates. LOOK drives how the mandala
 * animates. Both are intentionally one editable file so they are easy to tune.
 */
import {
  GenerationMode,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { LOOPType, Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { DifficultyLevel } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { MandalaPresetId, UndulationEasing } from "./mandala-types";

/** Even lengths read as fuller mandalas; one is picked at random per draw. */
export const LOADER_LENGTHS = [8, 10, 12, 16] as const;

/**
 * Base generation recipe. LOOP (rotated) sequences make symmetric petal
 * mandalas, which read best as ambient art. To use plain freeform instead,
 * set `mode: GenerationMode.FREEFORM` and drop `loopType`/`period`.
 */
export function buildLoaderRecipe(length: number): GenerationOptions {
  return {
    mode: GenerationMode.CIRCULAR,
    loopType: LOOPType.ROTATED,
    period: Period.HALVED,
    length,
    gridMode: GridMode.DIAMOND,
    propType: PropType.STAFF,
    difficulty: DifficultyLevel.INTERMEDIATE,
    constraintPreset: "smooth",
  };
}

/** Visual look for the loader's mandala. */
export const MANDALA_LOADER_LOOK = {
  animateEasing: "breathe" as UndulationEasing,
  animateRotation: 30, // slow degrees per undulation cycle
  animatePeriod: 6, // seconds per undulation
  animateMin: 40,
  animateMax: 250,
  /** Color presets randomized per draw for variety. */
  presets: ["aurora", "twilight", "ice", "ember"] as MandalaPresetId[],
  strokeWidth: 2.5,
} as const;

/** Pool sizing. */
export const MANDALA_POOL_TARGET = 24; // try to keep this many around
export const MANDALA_POOL_CAP = 40; // hard cap; drop oldest beyond this
export const MANDALA_POOL_MIN = 3; // below this, seed synchronously on first use
export const MANDALA_TOPUP_BATCH = 2; // generate this many per idle top-up

/** Loader timing. */
export const MANDALA_DWELL_MS = 5000; // time per sequence before crossfade
export const MANDALA_CROSSFADE_MS = 900;
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i mandala-loader-config`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/mandala/domain/mandala-loader-config.ts
git commit -m "feat(mandala): add MandalaLoader recipe + look config" -- src/lib/shared/mandala/domain/mandala-loader-config.ts
```

---

## Task 5: The pool service

Pure helpers (eviction selection, sampling) are unit-tested. The Dexie + generator wiring is thin and verified visually in Task 7.

**Files:**
- Create: `src/lib/shared/mandala/services/mandala-pool.svelte.ts`
- Test: `src/lib/shared/mandala/services/__tests__/mandala-pool.test.ts`

- [ ] **Step 1: Write the failing test for the pure helpers**

`src/lib/shared/mandala/services/__tests__/mandala-pool.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectDropIds, sampleEntry } from "../mandala-pool.svelte";
import type { GeneratedMandalaEntry } from "../../domain/mandala-pool-types";

function entry(id: string, generatedAt: number): GeneratedMandalaEntry {
  return { id, generatedAt, sequence: { steps: [] } as any };
}

describe("mandala-pool helpers", () => {
  it("selectDropIds returns the oldest ids beyond the cap", () => {
    const entries = [
      entry("a", 100),
      entry("b", 300),
      entry("c", 200),
      entry("d", 400),
    ];
    // cap 2 → keep the 2 newest (d@400, b@300), drop a@100 and c@200
    expect(new Set(selectDropIds(entries, 2))).toEqual(new Set(["a", "c"]));
  });

  it("selectDropIds returns nothing when under cap", () => {
    expect(selectDropIds([entry("a", 1)], 5)).toEqual([]);
  });

  it("sampleEntry returns a pool member deterministically for a given rng", () => {
    const entries = [entry("a", 1), entry("b", 2), entry("c", 3)];
    const rng = () => 0.5; // 0.5 * 3 = 1.5 → floor → index 1 → "b"
    expect(sampleEntry(entries, rng)?.id).toBe("b");
  });

  it("sampleEntry returns null for an empty pool", () => {
    expect(sampleEntry([], Math.random)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/shared/mandala/services/__tests__/mandala-pool.test.ts`
Expected: FAIL — cannot find module `../mandala-pool.svelte`.

- [ ] **Step 3: Implement the pool service**

`src/lib/shared/mandala/services/mandala-pool.svelte.ts`:

```ts
/**
 * MandalaLoader pool — a small bounded set of locally-generated sequences.
 *
 * - Persisted in the `generatedMandalaPool` Dexie store across sessions.
 * - Seeds itself live on first run (cold store) so there is no fixture file.
 * - Tops up during idle, dropping the oldest beyond the cap.
 * - Generation is fully client-side (GenerationOrchestrator), no network.
 */
import { db } from "$lib/shared/persistence/database/tka-database";
import { generationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { GeneratedMandalaEntry } from "../domain/mandala-pool-types";
import {
  buildLoaderRecipe,
  LOADER_LENGTHS,
  MANDALA_POOL_CAP,
  MANDALA_POOL_MIN,
  MANDALA_POOL_TARGET,
  MANDALA_TOPUP_BATCH,
} from "../domain/mandala-loader-config";

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** Ids to evict so the pool stays at/under `cap` — oldest `generatedAt` first. */
export function selectDropIds(entries: GeneratedMandalaEntry[], cap: number): string[] {
  if (entries.length <= cap) return [];
  const byNewest = [...entries].sort((a, b) => b.generatedAt - a.generatedAt);
  return byNewest.slice(cap).map((e) => e.id);
}

/** Pick one entry using the given rng (defaults to Math.random). */
export function sampleEntry(
  entries: GeneratedMandalaEntry[],
  rng: () => number = Math.random,
): GeneratedMandalaEntry | null {
  if (entries.length === 0) return null;
  return entries[Math.min(entries.length - 1, Math.floor(rng() * entries.length))]!;
}

// ── Service (Dexie + generation wiring) ─────────────────────────────────────

const isBrowser = typeof window !== "undefined" && typeof indexedDB !== "undefined";

let entries = $state<GeneratedMandalaEntry[]>([]);
let warming: Promise<void> | null = null;
let toppingUp = false;

function randomLength(): number {
  return LOADER_LENGTHS[Math.floor(Math.random() * LOADER_LENGTHS.length)]!;
}

/** Generate one sequence from the recipe; returns null on engine failure. */
async function generateOne(): Promise<GeneratedMandalaEntry | null> {
  try {
    const seq: SequenceData = await generationOrchestrator.generateSequence(
      buildLoaderRecipe(randomLength()),
    );
    // Plain-ify: steps may be reactive proxies / class instances — Dexie needs
    // structured-cloneable data.
    const plain = JSON.parse(JSON.stringify(seq)) as SequenceData;
    return { id: crypto.randomUUID(), sequence: plain, generatedAt: Date.now() };
  } catch {
    return null; // beam search found no path — skip, keep existing pool
  }
}

async function persist(entry: GeneratedMandalaEntry): Promise<void> {
  await db.generatedMandalaPool.put(entry);
}

async function evictOverflow(): Promise<void> {
  const dropIds = selectDropIds(entries, MANDALA_POOL_CAP);
  if (dropIds.length === 0) return;
  await db.generatedMandalaPool.bulkDelete(dropIds);
  const drop = new Set(dropIds);
  entries = entries.filter((e) => !drop.has(e.id));
}

export const mandalaPool = {
  /** Number of sequences currently in memory. */
  get count(): number {
    return entries.length;
  },

  /**
   * Ensure the pool has at least MANDALA_POOL_MIN sequences. Reads the Dexie
   * store; if cold, generates a starter batch live. Idempotent + de-duped.
   */
  async ensureWarm(): Promise<void> {
    if (!isBrowser) return;
    if (warming) return warming;
    warming = (async () => {
      const stored = await db.generatedMandalaPool.toArray();
      entries = stored;
      while (entries.length < MANDALA_POOL_MIN) {
        const made = await generateOne();
        if (!made) break; // avoid an infinite loop if generation keeps failing
        await persist(made);
        entries = [...entries, made];
      }
    })();
    try {
      await warming;
    } finally {
      warming = null;
    }
  },

  /** Random sequence, or null if the pool is still cold. */
  sample(): SequenceData | null {
    return sampleEntry(entries)?.sequence ?? null;
  },

  /**
   * Background top-up toward MANDALA_POOL_TARGET. Call after first paint, on
   * idle. Generates one small batch per call; drops oldest beyond the cap.
   */
  async topUp(): Promise<void> {
    if (!isBrowser || toppingUp) return;
    if (entries.length >= MANDALA_POOL_TARGET) return;
    toppingUp = true;
    try {
      for (let i = 0; i < MANDALA_TOPUP_BATCH; i++) {
        const made = await generateOne();
        if (!made) break;
        await persist(made);
        entries = [...entries, made];
      }
      await evictOverflow();
    } finally {
      toppingUp = false;
    }
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/shared/mandala/services/__tests__/mandala-pool.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/mandala/services/mandala-pool.svelte.ts src/lib/shared/mandala/services/__tests__/mandala-pool.test.ts
git commit -m "feat(mandala): bounded local pool service (live seed + idle top-up)" -- src/lib/shared/mandala/services/mandala-pool.svelte.ts src/lib/shared/mandala/services/__tests__/mandala-pool.test.ts
```

---

## Task 6: The MandalaLoader component

**Files:**
- Create: `src/lib/shared/mandala/components/MandalaLoader.svelte`

- [ ] **Step 1: Write the component**

`src/lib/shared/mandala/components/MandalaLoader.svelte`:

```svelte
<script lang="ts">
  /**
   * MandalaLoader — ambient loading visual. Renders a live, undulating mandala
   * that crossfades through a small pool of locally-generated sequences.
   * Falls back to a thin bar while the pool warms (first-ever run). Honors
   * prefers-reduced-motion (static single mandala, no crossfade).
   */
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import SequenceMandala from "./SequenceMandala.svelte";
  import IndeterminateBar from "$lib/shared/components/loading/IndeterminateBar.svelte";
  import { mandalaPool } from "../services/mandala-pool.svelte";
  import { flowPalette, flowGradientColors, PRESET_COLORS } from "../domain/mandala-palette";
  import {
    MANDALA_LOADER_LOOK,
    MANDALA_DWELL_MS,
    MANDALA_CROSSFADE_MS,
  } from "../domain/mandala-loader-config";

  interface Props {
    /** Status line under the mandala. */
    message?: string;
    /** Mandala size in px. */
    size?: number;
  }
  let { message = "", size = 320 }: Props = $props();

  let current = $state<any>(null);
  let currentKey = $state(0);
  let preset = $state<(typeof MANDALA_LOADER_LOOK.presets)[number]>(MANDALA_LOADER_LOOK.presets[0]);
  let phase = $state(0);
  let reducedMotion = $state(false);

  // Color flow + dwell timers, plus the reduced-motion query, are all set up on
  // mount so SSR renders nothing animated.
  onMount(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = mq.matches;
    const onMq = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
    mq.addEventListener("change", onMq);

    let rafId = 0;
    let dwellId: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    function draw() {
      const next = mandalaPool.sample();
      if (next) {
        current = next;
        currentKey += 1;
        const presets = MANDALA_LOADER_LOOK.presets;
        preset = presets[Math.floor(Math.random() * presets.length)]!;
      }
    }

    (async () => {
      await mandalaPool.ensureWarm();
      if (disposed) return;
      draw();
      if (!reducedMotion) {
        dwellId = setInterval(draw, MANDALA_DWELL_MS);
      }
      // After first paint, top up the pool for next time on idle.
      const idle =
        (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
      idle(() => {
        void mandalaPool.topUp();
      });
    })();

    // Color-flow loop (skipped under reduced motion).
    let start: number | null = null;
    function tick(t: number) {
      if (start === null) start = t;
      phase = (((t - start) / 1000) % MANDALA_LOADER_LOOK.animatePeriod) /
        MANDALA_LOADER_LOOK.animatePeriod;
      rafId = requestAnimationFrame(tick);
    }
    if (!reducedMotion) rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      mq.removeEventListener("change", onMq);
      if (rafId) cancelAnimationFrame(rafId);
      if (dwellId) clearInterval(dwellId);
    };
  });

  const morph = $derived(PRESET_COLORS[preset as Exclude<typeof preset, "custom">].morph);
  const palette = $derived(flowPalette(morph, phase));
  const gradient = $derived(flowGradientColors(morph, phase));
</script>

<div class="mandala-loader" role="status" aria-label={message || "Loading"} aria-busy="true">
  {#if current}
    <div class="stage" style:width="{size}px" style:height="{size}px">
      {#key currentKey}
        <div
          class="layer"
          in:fade={{ duration: reducedMotion ? 0 : MANDALA_CROSSFADE_MS }}
          out:fade={{ duration: reducedMotion ? 0 : MANDALA_CROSSFADE_MS }}
        >
          <SequenceMandala
            sequence={current}
            {size}
            show="both"
            style="stroke"
            animate={!reducedMotion}
            animateEasing={MANDALA_LOADER_LOOK.animateEasing}
            animateRotation={reducedMotion ? 0 : MANDALA_LOADER_LOOK.animateRotation}
            animatePeriod={MANDALA_LOADER_LOOK.animatePeriod}
            animateMin={MANDALA_LOADER_LOOK.animateMin}
            animateMax={MANDALA_LOADER_LOOK.animateMax}
            strokeWidth={MANDALA_LOADER_LOOK.strokeWidth}
            {palette}
            {gradient}
          />
        </div>
      {/key}
    </div>
  {:else}
    <!-- Pool still warming (first-ever run): calm bar, no jank. -->
    <IndeterminateBar position="top" />
  {/if}
  {#if message}
    <span class="message">{message}</span>
  {/if}
</div>

<style>
  .mandala-loader {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    background: var(--theme-panel-bg, rgba(10, 10, 16, 0.98));
  }
  .stage {
    position: relative;
  }
  .layer {
    position: absolute;
    inset: 0;
  }
  .message {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    letter-spacing: 0.02em;
  }
</style>
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i "MandalaLoader"`
Expected: no errors referencing `MandalaLoader.svelte`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/mandala/components/MandalaLoader.svelte
git commit -m "feat(mandala): MandalaLoader component — undulating crossfade loader" -- src/lib/shared/mandala/components/MandalaLoader.svelte
```

---

## Task 7: Visual verification route

**Files:**
- Create: `src/routes/test/mandala-loader/+page.svelte`

- [ ] **Step 1: Create the test page**

`src/routes/test/mandala-loader/+page.svelte`:

```svelte
<script lang="ts">
  import MandalaLoader from "$lib/shared/mandala/components/MandalaLoader.svelte";
</script>

<div class="frame">
  <MandalaLoader message="Loading the alphabet…" size={360} />
</div>

<style>
  .frame {
    position: fixed;
    inset: 0;
    background: #07070c;
  }
</style>
```

- [ ] **Step 2: Verify it renders (manual, with proof)**

Start a private dev server (never touch port 5173): `vite --port 5174` (background).
Then capture runtime proof via Chrome DevTools MCP (ask Austen for permission to drive the browser first, per project rules), navigating to `https://localhost:5174/test/mandala-loader`:
- `take_screenshot` showing a rendered mandala (not the bar) after ~2s.
- `evaluate_script` returning `document.querySelectorAll('.mandala-loader canvas, .mandala-loader svg').length` > 0.

If browser permission is not granted, report: "Cannot verify visually — please open https://localhost:5174/test/mandala-loader and confirm a colored mandala appears and swaps every ~5s."

- [ ] **Step 3: Commit**

```bash
git add src/routes/test/mandala-loader/+page.svelte
git commit -m "test(mandala): add MandalaLoader visual verification route" -- src/routes/test/mandala-loader/+page.svelte
```

---

## Task 8: LoadingGate mandala variant

**Files:**
- Modify: `src/lib/shared/components/loading/LoadingGate.svelte`

- [ ] **Step 1: Add the variant**

In `LoadingGate.svelte`:

1. Import the loader at the top of the script:

```ts
  import MandalaLoader from "$lib/shared/mandala/components/MandalaLoader.svelte";
```

2. Widen the `variant` prop type:

```ts
    variant?: "bar" | "card" | "skeleton" | "mandala";
```

3. Add a branch before the closing `{/if}` of the variant block:

```svelte
  {:else if variant === "mandala"}
    <MandalaLoader {message} />
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i "LoadingGate"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/components/loading/LoadingGate.svelte
git commit -m "feat(loading): add LoadingGate mandala variant" -- src/lib/shared/components/loading/LoadingGate.svelte
```

---

## Task 9: Wire the mandala into the Create module load

`ModuleRenderer` renders `<ModuleSkeleton moduleKey={activeModule} />` while a module chunk loads. Give `create` a mandala (mirroring the museum special-case), leaving every other module on its existing skeleton.

**Files:**
- Modify: `src/lib/shared/modules/skeletons/ModuleSkeleton.svelte`

- [ ] **Step 1: Branch to the mandala for create**

Replace the entire contents of `ModuleSkeleton.svelte` with:

```svelte
<!--
  Dispatcher: given the active module key, render its bespoke layout skeleton
  (or the shared shell fallback). Create gets the ambient MandalaLoader — its
  chunk is the heaviest, so the wait is long enough to be worth the visual.
-->
<script lang="ts">
  import { resolveSkeleton } from "./index";
  import MandalaLoader from "$lib/shared/mandala/components/MandalaLoader.svelte";
  let { moduleKey }: { moduleKey: string | null } = $props();
  const Skeleton = $derived(resolveSkeleton(moduleKey));
</script>

{#if moduleKey === "create"}
  <MandalaLoader message="Loading Create…" />
{:else}
  <Skeleton />
{/if}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i "ModuleSkeleton"`
Expected: no errors.

- [ ] **Step 3: Verify the Create load shows the mandala (manual, with proof)**

On the private dev server (`vite --port 5174`), with Austen's browser permission, hard-navigate to `https://localhost:5174/?mode=app` and switch to Create from another module to force a chunk load; capture a screenshot of the mandala during the load. If permission not granted, report the manual step for Austen to confirm.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/modules/skeletons/ModuleSkeleton.svelte
git commit -m "feat(create): show MandalaLoader during Create module load" -- src/lib/shared/modules/skeletons/ModuleSkeleton.svelte
```

---

## Task 10: Full verification gate

- [ ] **Step 1: Run the mandala unit tests**

Run: `npx vitest run src/lib/shared/mandala/`
Expected: all PASS.

- [ ] **Step 2: One full type-check**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | grep -iE "mandala|loadinggate|moduleskeleton|app.html" || echo "no mandala-related errors"`
Expected: `no mandala-related errors` (and no NEW errors elsewhere — compare to a pre-change baseline if the log is noisy).

- [ ] **Step 3: Full build**

Run: `npm run build > /tmp/build.log 2>&1; tail -5 /tmp/build.log`
Expected: build succeeds.

- [ ] **Step 4: Final runtime proof**

Capture (with browser permission) a screenshot of `https://localhost:5174/test/mandala-loader` showing a colored mandala, plus confirmation it swaps after ~5s. Attach as the verification evidence for "done."

---

## Self-Review notes

- **Spec coverage:** boot de-cheese (Task 2), MandalaLoader (Task 6), pool with live seed + idle top-up + drop-oldest (Tasks 4–5), Dexie store (Task 3), crossfade via Svelte `fade` (Task 6), flow color via extracted palette (Task 1), reduced-motion fallback (Task 6), LoadingGate variant + Create wiring (Tasks 8–9). Baked-seed requirement consciously replaced with live first-run seed (documented at top).
- **Type consistency:** `GeneratedMandalaEntry` (Task 3) used by the pool (Task 5); `buildLoaderRecipe`/`MANDALA_LOADER_LOOK`/pool constants (Task 4) consumed by pool (Task 5) + component (Task 6); `flowPalette`/`flowGradientColors`/`PRESET_COLORS` (Task 1) consumed by component (Task 6).
- **PoolSource seam:** `mandalaPool` exposes `ensureWarm`/`sample`/`topUp`; a future `FirebasePoolSource` can satisfy the same shape without touching `MandalaLoader`.
```
