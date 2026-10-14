# Tunnel Performer Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Each tunnel performer (center + every overlaid copy) carries its own
per-hand prop, driven by a cycling **Performer Set**, editable in the Art panel
with built-in + user-saved presets. Performer colors stay on the existing
rainbow/uniform spectrum fan.

**Architecture:** A `TunnelAppearance` = ordered list of `PerformerSkin`s (blue
prop + red prop per skin). Arm `k` wears `skins[k % len]`: arm 0 = center pair,
arm `i+1` = additional layer `i`. The center honors its skin through the existing
`bluePropType`/`redPropType` override props on `AnimatorCanvas`. Copies get
per-layer prop type threaded through `AdditionalLayerProps → handleAdditionalLayers
→ loadAdditionalLayerPropTextures → Canvas2DImageLoader` (which already does
per-layer color + sprite; only prop TYPE + per-layer DIMENSIONS are missing).

**Tech Stack:** Svelte 5 runes, `.svelte.ts` singleton state, Canvas2D renderer,
Vitest.

**Scope tonight (lean core):** per-performer PROP + Performer-Set model + presets
+ persistence + Appearance UI, reusing the spectrum color fan.
**Deferred (next phase, documented):** explicit per-hand COLOR picking
(`colorMode: "skin"` + prop-sprite tint), per-layer prop in the video EXPORT
(export files are another agent's in-flight refactor — keep `preload…` signature
backward compatible, do NOT touch `export-coordinator`/`sequence-modal-exporter`/
`ArtPane`).

---

## File Structure

**Create:**
- `src/lib/shared/sequence-viewer/tunnel/tunnel-appearance.ts` — model +
  `skinForArm` + built-in presets + `coerceAppearance`.
- `src/lib/shared/sequence-viewer/tunnel/tunnel-user-appearances.svelte.ts` —
  localStorage-backed user store (mirrors `tunnel-user-presets.svelte.ts`).
- `src/lib/shared/sequence-viewer/tunnel/tunnel-appearance.test.ts` — pure-fn tests.
- `src/lib/shared/sequence-viewer/components/AppearanceSection.svelte` — the
  Performer-Set editor (presets grid + skin chips + per-hand pickers + color mode).

**Modify (engine — all files I own):**
- `animation-engine/domain/types/trail-capture-types.ts` — extend `AdditionalLayerProps`.
- `animation-engine/services/canvas2d/canvas-2d-image-loader.ts` — per-hand prop
  type + per-layer dims + `getAdditionalLayerDimensions`.
- `animation-engine/services/canvas-2d-animation-renderer.ts` —
  `loadAdditionalLayerPropTextures` new sig; renderScene uses per-layer dims.
- `animation-engine/services/IAnimationRenderer.ts` — interface sig.
- `animation-engine/services/prop-type-manager.ts` — per-layer prop type in
  `handleAdditionalLayers`; keep `preloadAdditionalLayerTextures` back-compat.
- `animation-engine/services/prop-type-manager.layers.test.ts` — new sig + coverage.

**Modify (tunnel):**
- `tunnel/tunnel-view-state.ts` — persist `skins`; add `"appearance"` section.
- `tunnel/tunnel-view-controller.svelte.ts` — appearance state, `additionalLayersAt`
  carries per-layer prop types, `centerBluePropType`/`centerRedPropType`.
- `tunnel/TunnelArtView.svelte` — pass center skin prop types.
- `sequence-viewer/components/ArtSettingsPanel.svelte` — render `AppearanceSection`
  under a new rail tab.

---

## Task 1 — Appearance model (pure, TDD)

**Files:** Create `tunnel-appearance.ts`, `tunnel-appearance.test.ts`.

- [ ] **Write failing tests** for `skinForArm` cycling + `coerceAppearance` +
  presets round-trip:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_APPEARANCE, DEFAULT_SKIN, APPEARANCE_PRESETS,
  skinForArm, coerceSkins, type PerformerSkin,
} from "./tunnel-appearance";

describe("skinForArm — cycling", () => {
  const two: PerformerSkin[] = [
    { blueProp: "staff", redProp: "staff" },
    { blueProp: "sword", redProp: "sword" },
  ];
  it("1 skin = uniform for every arm", () => {
    for (const arm of [0, 1, 5, 15]) expect(skinForArm([DEFAULT_SKIN], arm)).toEqual(DEFAULT_SKIN);
  });
  it("2 skins alternate by arm index (arm 0 = center = skin 0)", () => {
    expect(skinForArm(two, 0)).toBe(two[0]);
    expect(skinForArm(two, 1)).toBe(two[1]);
    expect(skinForArm(two, 2)).toBe(two[0]);
    expect(skinForArm(two, 3)).toBe(two[1]);
  });
  it("empty list falls back to the default skin", () => {
    expect(skinForArm([], 0)).toEqual(DEFAULT_SKIN);
  });
});

describe("coerceSkins — hardening persisted data", () => {
  it("drops non-objects, defaults missing props, always yields >=1", () => {
    expect(coerceSkins(undefined)).toEqual([DEFAULT_SKIN]);
    expect(coerceSkins([])).toEqual([DEFAULT_SKIN]);
    expect(coerceSkins([{ blueProp: "club" }])).toEqual([{ blueProp: "club", redProp: "staff" }]);
  });
  it("caps the list length", () => {
    expect(coerceSkins(Array(99).fill({ blueProp: "staff", redProp: "staff" })).length).toBeLessThanOrEqual(8);
  });
});

describe("APPEARANCE_PRESETS", () => {
  it("every preset has >=1 skin and a stable id", () => {
    for (const p of APPEARANCE_PRESETS) {
      expect(p.appearance.length).toBeGreaterThan(0);
      expect(typeof p.id).toBe("string");
    }
  });
});
```

- [ ] **Run:** `npx vitest run src/lib/shared/sequence-viewer/tunnel/tunnel-appearance.test.ts` → FAIL (module missing).

- [ ] **Implement** `tunnel-appearance.ts`:

```ts
/** One performer's costume: a prop per hand. Colors ride the spectrum fan
 *  (rainbow) or the base pair (uniform) — explicit per-hand color is a later
 *  phase (see the design doc's deferred section). */
export interface PerformerSkin {
  blueProp: string; // PropType value, e.g. "staff"
  redProp: string;
}

/** The whole cast: an ordered set of skins the copies cycle through. Arm k
 *  (0 = center pair, i+1 = additional layer i) wears skins[k % length]. */
export type TunnelAppearance = PerformerSkin[];

export const DEFAULT_SKIN: PerformerSkin = { blueProp: "staff", redProp: "staff" };
export const DEFAULT_APPEARANCE: TunnelAppearance = [DEFAULT_SKIN];
export const MAX_SKINS = 8;

const PROP_FALLBACK = "staff";
const asProp = (v: unknown): string => (typeof v === "string" && v.length > 0 ? v : PROP_FALLBACK);

/** Which skin arm `armIndex` wears. Wraps; empty → the default skin. */
export function skinForArm(skins: TunnelAppearance, armIndex: number): PerformerSkin {
  if (skins.length === 0) return DEFAULT_SKIN;
  const i = ((armIndex % skins.length) + skins.length) % skins.length;
  return skins[i]!;
}

/** Harden persisted / preset data into a valid non-empty skin list. */
export function coerceSkins(raw: unknown): TunnelAppearance {
  if (!Array.isArray(raw)) return [{ ...DEFAULT_SKIN }];
  const out = raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .slice(0, MAX_SKINS)
    .map((s) => ({ blueProp: asProp(s.blueProp), redProp: asProp(s.redProp) }));
  return out.length > 0 ? out : [{ ...DEFAULT_SKIN }];
}

export interface AppearancePreset {
  id: string;
  name: string;
  appearance: TunnelAppearance;
}

/** Built-in performer sets. Curated by eye; ids are stable (persistence key). */
export const APPEARANCE_PRESETS: AppearancePreset[] = [
  { id: "solo", name: "Solo", appearance: [{ blueProp: "staff", redProp: "staff" }] },
  { id: "duel", name: "Duel", appearance: [
    { blueProp: "staff", redProp: "staff" },
    { blueProp: "sword", redProp: "sword" },
  ] },
  { id: "troupe", name: "Troupe", appearance: [
    { blueProp: "staff", redProp: "staff" },
    { blueProp: "club", redProp: "club" },
    { blueProp: "fan", redProp: "fan" },
  ] },
  { id: "fire-fans", name: "Fans", appearance: [{ blueProp: "fan", redProp: "fan" }] },
  { id: "hoops", name: "Hoops", appearance: [{ blueProp: "minihoop", redProp: "minihoop" }] },
];

/** Structural equality of two skin lists (preset-match highlight). */
export function skinsEqual(a: TunnelAppearance, b: TunnelAppearance): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.blueProp === b[i]!.blueProp && s.redProp === b[i]!.redProp);
}
```

- [ ] **Run:** vitest → PASS.
- [ ] **Commit:** `git commit -m "feat(tunnel): PerformerSkin appearance model + skinForArm cycling" -- src/lib/shared/sequence-viewer/tunnel/tunnel-appearance.ts src/lib/shared/sequence-viewer/tunnel/tunnel-appearance.test.ts`

---

## Task 2 — Engine: per-layer prop type + dims

**Files:** `trail-capture-types.ts`, `canvas-2d-image-loader.ts`,
`canvas-2d-animation-renderer.ts`, `IAnimationRenderer.ts`, `prop-type-manager.ts`,
`prop-type-manager.layers.test.ts`.

- [ ] **Extend `AdditionalLayerProps`** (`trail-capture-types.ts`):

```ts
export interface AdditionalLayerProps {
  blueProp: PropState | null;
  redProp: PropState | null;
  /** Per-performer prop type (Performer Set). Absent → global prop (today). */
  bluePropType?: string;
  redPropType?: string;
}
```

- [ ] **Image loader** (`canvas-2d-image-loader.ts`): per-hand prop type + dims.
  Change `loadAdditionalLayerPropImages` signature + store dims + add getter:

```ts
// new field near additionalLayerImages
private additionalLayerDimensions: Array<{
  blue: { width: number; height: number };
  red: { width: number; height: number };
}> = [];

async loadAdditionalLayerPropImages(
  layerIndex: number,
  bluePropType: string,
  redPropType: string,
  blueColor: string,
  redColor: string,
): Promise<{ blue: HTMLImageElement; red: HTMLImageElement }> {
  const [bluePropData, redPropData] = await Promise.all([
    generatePropSvg(bluePropType, blueColor),
    generatePropSvg(redPropType, redColor),
  ]);
  const [newBlueImage, newRedImage] = await Promise.all([
    this.createImageFromSVG(bluePropData.svg, bluePropData.width, bluePropData.height),
    this.createImageFromSVG(redPropData.svg, redPropData.width, redPropData.height),
  ]);
  while (this.additionalLayerImages.length <= layerIndex) {
    this.additionalLayerImages.push({ blue: null, red: null });
    this.additionalLayerDimensions.push({ blue: { width: 0, height: 0 }, red: { width: 0, height: 0 } });
  }
  this.additionalLayerImages[layerIndex] = { blue: newBlueImage, red: newRedImage };
  this.additionalLayerDimensions[layerIndex] = {
    blue: { width: bluePropData.width, height: bluePropData.height },
    red: { width: redPropData.width, height: redPropData.height },
  };
  return { blue: newBlueImage, red: newRedImage };
}

getAdditionalLayerDimensions(layerIndex: number): {
  blue: { width: number; height: number };
  red: { width: number; height: number };
} | null {
  return this.additionalLayerDimensions[layerIndex] ?? null;
}
```
Also clear `additionalLayerDimensions.length = 0` in `destroy()`.

- [ ] **Renderer** (`canvas-2d-animation-renderer.ts`):
  1. `loadAdditionalLayerPropTextures(layerIndex, bluePropType, redPropType, blueColor, redColor)` → forward both types.
  2. In both additional-layer draw loops, use per-layer dims when present:

```ts
const dims = this.imageLoader.getAdditionalLayerDimensions(i);
// blue loop:
this.renderProp(ctx, layer.blueProp, layerImages.blue,
  dims?.blue ?? params.bluePropDimensions, canvasSize,
  params.bluePropFlipped ?? false, params.bluePropType);
// red loop: dims?.red ?? params.redPropDimensions
```

- [ ] **Interface** (`IAnimationRenderer.ts`): update
  `loadAdditionalLayerPropTextures` sig to `(layerIndex, bluePropType, redPropType, blueColor, redColor)`.

- [ ] **Prop type manager** (`prop-type-manager.ts`):
  - `handleAdditionalLayers`: compute a prop-type signature; reset loaded flags
    when it changes (in addition to count/spectrum). For each layer, read
    `layer.bluePropType ?? state.currentBluePropType` and
    `layer.redPropType ?? state.currentRedPropType`, pass both to
    `loadAdditionalLayerPropTextures`.
  - Track `lastLayerPropSig: string`. Build sig =
    `layers.map(l => (l.bluePropType ?? "") + ":" + (l.redPropType ?? "")).join("|")`.
  - `preloadAdditionalLayerTextures` — keep public sig
    `(layerCount, spectrum, propType, perLayerTypes?)` where `perLayerTypes?:
    {blue:string; red:string}[]`. When absent use `propType` for both hands
    (today's export behavior — untouched export files still compile).

```ts
// inside preload loop:
const t = perLayerTypes?.[i];
const blueType = t?.blue ?? propType;
const redType = t?.red ?? propType;
return this.animationRenderer!
  .loadAdditionalLayerPropTextures(i, blueType, redType, blue, red)
  .then(() => { this.additionalLayerTexturesLoaded[i] = true; });
```

- [ ] **Update** `prop-type-manager.layers.test.ts`: mock renderer records
  `(i, bluePropType, redPropType, blue, red)`; existing assertions become
  `c.bluePropType`; add a test: `preloadAdditionalLayerTextures(2, true, "staff",
  [{blue:"sword",red:"club"},{blue:"fan",red:"fan"}])` → layer 0 blue=sword/red=club.

- [ ] **Run:** `npx vitest run src/lib/shared/animation-engine/services/prop-type-manager.layers.test.ts` → PASS.
- [ ] **Commit** engine files (explicit pathspec, NOT export files).

---

## Task 3 — Controller + persistence

**Files:** `tunnel-view-state.ts`, `tunnel-view-controller.svelte.ts`.

- [ ] `tunnel-view-state.ts`: add `skins: PerformerSkin[]` to `TunnelViewState`
  (default `DEFAULT_APPEARANCE`), coerce on load via `coerceSkins`, persist. Add
  `"appearance"` to the `section` union + the load guard.
- [ ] `tunnel-view-controller.svelte.ts`:
  - `skins = $state<PerformerSkin[]>([...DEFAULT_APPEARANCE])`; restore + persist
    in the existing view-state effect.
  - `additionalLayersAt(step)`: for layer i, `const s = skinForArm(this.skins, i + 1);`
    return `{ blueProp, redProp, bluePropType: s.blueProp, redPropType: s.redProp }`.
  - `centerSkin = $derived(skinForArm(this.skins, 0))`;
    `centerBluePropType = $derived(this.centerSkin.blueProp)` +
    `centerRedPropType`.
  - Mutators: `setSkinProp(i, hand: "blue"|"red", prop)`, `addSkin()` (clones last,
    capped MAX_SKINS), `removeSkin(i)` (floor 1), `applyAppearance(skins)`
    (coerce + set), `activeAppearancePresetId = $derived(...)` via `skinsEqual`.
- [ ] **Commit** the two files.

---

## Task 4 — Wire the center + copies through TunnelArtView

**Files:** `TunnelArtView.svelte`.

- [ ] Replace the incoming `bluePropType`/`redPropType` forwarded to
  `AnimatorCanvas` with the controller's center skin when the appearance is
  non-default, falling back to the passed-in global prop:

```svelte
<AnimatorCanvas
  bluePropType={controller.centerBluePropType ?? bluePropType}
  redPropType={controller.centerRedPropType ?? redPropType}
  ... />
```
(`additionalLayers` already flows from `controller.additionalLayersAt(step)`.)

- [ ] **Verify live:** open the tunnel, no visual change with the default (1-skin
  staff) appearance — regression guard.
- [ ] **Commit.**

---

## Task 5 — User-appearance store

**Files:** Create `tunnel-user-appearances.svelte.ts` (+ inline test in
`tunnel-appearance.test.ts` is not needed; the store mirrors the proven
`tunnel-user-presets` shape).

- [ ] Copy the `tunnel-user-presets.svelte.ts` structure: `UserAppearance {id,
  name, skins}`, `STORAGE_KEY = "tka_tunnel_user_appearances"`, `MAX = 24`,
  `coerce` via `coerceSkins`, `$state` singleton `tunnelUserAppearances` with
  `add(name, skins)` / `remove(id)`.
- [ ] **Commit.**

---

## Task 6 — Appearance UI

**Files:** Create `AppearanceSection.svelte`; modify `ArtSettingsPanel.svelte`.

- [ ] `AppearanceSection.svelte` (props: `controller`):
  - **Presets grid** — reuse the mandala-preset card markup from
    `ArtSettingsPanel`: `APPEARANCE_PRESETS` + `tunnelUserAppearances.appearances`
    (user cards get a delete button, per the tunnel-user-presets pattern), active
    when `skinsEqual`.
  - **Performer roster** — one row per skin: label ("Performer N"), a blue-hand
    and red-hand chip showing the current prop; add/remove-skin controls
    (`FilterChipBase` action mode or a `+`/trash button ≥44px). Tapping a hand
    chip opens `PropSelectionSheet` / a `BentoPropGrid` (`color="blue"|"red"`,
    `onSelect` → `controller.setSkinProp`).
  - **Color control** — `SegmentedControl` (Rainbow / Uniform) bound to
    `controller.spectrum` (relocate the spectrum concept here; leave the existing
    toggle intact to avoid churn, or move it — pick one and keep DRY).
  - **Save current** — text input + Save → `tunnelUserAppearances.add`.
  - All touch targets ≥44px, design tokens, no `<input type=checkbox>`, no raw
    `class="chip"` filter buttons (use the primitives).
- [ ] `ArtSettingsPanel.svelte`: add an "Appearance" rail tab that renders
  `<AppearanceSection {controller} />`.
- [ ] **Run** full `npm run check` (capture once to a log). Fix errors. Re-verify.
- [ ] **Commit** UI files.

---

## Verification

- Unit: `tunnel-appearance.test.ts` + `prop-type-manager.layers.test.ts` green.
- `npm run check` clean.
- Live (user eyeball): tunnel with Performer Set "Duel" → alternating staff/sword
  copies; center = staff; picking a different prop for Performer 2 hot-swaps only
  the odd arms; Rainbow vs Uniform still fans colors.

## Deferred (flagged, next phase)
- Per-hand explicit COLOR picking (`colorMode: "skin"`, prop-sprite tint).
- Per-performer prop in the video EXPORT (needs the export files, currently
  another agent's in-flight refactor — `preloadAdditionalLayerTextures` kept
  backward compatible so nothing breaks).
- Fire-tip per-layer dims (effects on differently-shaped copies sit at base dims).
