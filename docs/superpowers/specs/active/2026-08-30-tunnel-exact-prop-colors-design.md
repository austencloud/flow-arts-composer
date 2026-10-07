---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify exact Left/Right Tunnel colors through snapshot, share, render, and export round trips.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Tunnel Exact Prop Colors

## Outcome

Tunnel authors can choose exact Left and Right prop colors without depending on
color recognition alone. The chosen pair is labeled in text, appears on the
base performer and every generated copy, survives save/reopen and public-copy
flows, and renders identically in live playback and video export.

## Interaction

The existing Colors control becomes a three-way mode:

- **Hand colors** uses the theme-aware pictograph Left/Right colors.
- **Spectrum** assigns distinct hues to generated copies while keeping the base
  performer on the pictograph pair.
- **Custom pair** opens two labeled color controls: `Left prop` and `Right prop`.
  Each control shows its exact hexadecimal value, so neither meaning nor state
  is communicated by color alone.

The custom controls appear through the canonical reduced-motion-aware
disclosure transition. Choosing another mode hides them without discarding the
authored pair. Returning to Custom restores the previous values.

## State Contract

`TunnelPropColorState` is the single color owner:

```ts
type TunnelPropColorMode = "hands" | "spectrum" | "custom";

interface TunnelPropColorState {
  mode: TunnelPropColorMode;
  custom: { blue: string; red: string };
}
```

The persisted view-state and Tunnel snapshot both store this state. Snapshot
version 3 replaces the version-2 `spectrum` boolean. Migration maps `true` to
Spectrum and `false` to Hand colors, and seeds the custom pair from the canonical
dark-stage hand colors. All inputs are normalized to six-digit hexadecimal
colors at the state boundary.

`TunnelViewController` exposes the color state directly. A compatibility
`spectrum` getter/setter remains temporarily for non-authoring preview fixtures;
all production Tunnel surfaces use the explicit mode.

## Rendering Contract

The animation engine receives an optional exact prop pair in addition to the
existing spectrum flag:

- no exact pair + spectrum off: current Hand colors;
- no exact pair + spectrum on: current generated-copy spectrum;
- exact pair: the pair colors the base performer and every generated copy.

The same pair drives prop SVG textures, performer swatches, trails and
prop-matched effects, LED sampling, and offscreen export. Texture and effect
caches include the exact pair in their signatures so changing either color
updates a running Tunnel without remounting the canvas.

## Ownership And Reuse

`tunnel-prop-colors.ts` owns mode migration, validation, and color resolution.
The animation engine consumes that resolver rather than recreating Tunnel
color rules.

The labeled two-color control currently embedded in the Mandala palette becomes
the shared `LabeledColorPairPicker`. Mandala and Tunnel compose that primitive;
neither surface owns another hidden native-color-input implementation.

## Saved And Shared Tunnels

Snapshot capture/apply, creator handoff, local collection storage, public
revision sanitization, detail previews, and viewer staging all carry the version
3 color state. Existing version 1/2 saves migrate on read and remain visually
unchanged. Public payload sanitization keeps only the mode and normalized pair.

## Risks

- A UI-only color override would leave base props, effects, or exported frames
  mismatched. Verification must compare all consumers from one authored pair.
- Async prop texture generation can display stale colors if the pair is absent
  from cache signatures.
- Snapshot fixtures that bypass migration can disguise legacy compatibility
  failures; migration receives dedicated raw-version tests.
- Native color dialogs vary by platform, so the visible button, label, value,
  focus ring, and touch target remain app-owned and accessible.

## Verification

- Unit-test color normalization, mode resolution, version-2 migration, snapshot
  capture/apply round trips, view-state migration, and render/export propagation.
- Test texture cache invalidation and exact additional-layer SVG colors.
- Test the labeled color primitive's accessible names and emitted values.
- In a task-owned Chrome tab, author a non-default pair, confirm the base and
  copies update live, save/reopen it, and compare an exported frame.
- Inspect the settings surface at 375×667, 960×412, 820×1180, 1440×900,
  1920×1080, 2560×1440, and 3840×2160, plus 200% browser zoom. Record root font
  size, control widths, no horizontal overflow, keyboard reachability, and a
  clean console.
