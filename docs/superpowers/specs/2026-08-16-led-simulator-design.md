# LED Effect Rebuild: Physical Prop Simulator

**Date:** 2026-08-16
**Status:** Approved (design walked through in session; this document records it)
**Supersedes:** the per-tip evaluator LED system (22 patterns, 4 rendered LEDs) and the
2026-02-21 LED Lab design's unwired `PropLedConfig` remnants.

---

## Problem

The current LED effect went overboard and landed nowhere:

- The pattern library has **22 evaluators across 6 categories**, but the render
  surface is `getTipPoints()` → 2 tip points per staff, **4 LEDs total**. Every
  spatial pattern (chase, wave, comet, cascade) has no spatial axis to run on.
  Four of the spectrum evaluators are code-identical except hue-window constants.
- The presets are not looks. Three of four (`Green Glow`, `Ice Blue`,
  `Prop Colors`) are the identical `solid` patch with a different hex.
- `LedPanel.svelte` (341 lines) exposes 4 of the 11 `LedOverlayConfig` fields
  through a 22-item text dropdown. Overwhelming and unrepresentative at once.
- LED is still on the legacy `EffectLookPreview` thumbnail fallback while
  bloom/fire/trails/coal have earned bespoke thumbnails.
- Meanwhile a fully working `StripPattern` system (the Poi Lab) exists at
  `src/lib/features/poi/` with generators, image upload, a Firestore image
  library, POV previews, a beat timeline, and BLE hardware upload — sharing
  **zero code** with the effect.

## Decisions already made (Austen, this session)

1. **Identity: physical LED prop simulator.** The effect previews what a real
   LED prop would look like running a given mode. Patterns run on their own
   clock, looping continuously, independent of body motion — the same
   convention `LedStaffPreview.svelte` documents. Motion-reactive / "TKA-aware"
   patterns are cut by design, not trimmed.
2. **Device is a first-class choice.** Capsule-style prop vs pixel staff, with
   LED count, selected as a device. Patterns and presets follow from it.
3. **Approach: unify on `StripPattern`** (approach A of three considered).
   The Poi Lab stays a separate authoring/hardware surface; the **domain layer**
   (pattern data + generators) becomes shared.

---

## 1. Device model

`LedOverlayConfig` v2 gains a device:

```ts
interface LedDevice {
  kind: "capsule" | "pixel-staff";
  /** Fixed per-device options, not a free slider. Capsule is always 2. */
  ledCount: number;
}
```

- **Capsule** — 2 LEDs at the shaft endpoints (Flowtoys-style). This is what
  the current 2-tip system already renders, now named honestly.
- **Pixel staff** — N LEDs interpolated along the segment between the two
  tracked endpoints (Ignis iPixel-style; Austen's real props are 200-LED
  SK9822). LED *i* sits at `lerp(tipA, tipB, i / (N - 1))`. No new tracking:
  the tip tracker already provides both endpoints per prop.
- Pixel-staff LED counts are fixed options — **32 / 72 / 200** — you pick a
  prop, not a number. (200 matches the iPixel 200 HD; 32/72 are common shorter
  strips and cheaper render tiers.)

Both props run the same device and the same pattern in v1 (matching the
Poi Lab staff-preview convention). Per-hand patterns are out of scope.

## 2. Pattern ownership (never-hand-roll evidence gate)

**Search terms used:** `StripPattern`, `IPatternPreset`, `pattern evaluator`,
`ledCount frameCount`, `POV`, `led pattern registry`.
**Closest matches:** the effect's evaluator registry
(`src/lib/shared/animation-engine/domain/patterns/`) and the Poi Lab's
generator set (`src/lib/features/poi/domain/pattern-preset.ts`). Two parallel
implementations of "generate LED colors over time" already exist; this design
**merges them onto one owner** rather than adding a third.

**Owner:** `src/lib/shared/poi/domain/` — `strip-pattern.ts` already lives
there and is the universal currency (`ledCount × frameCount` interleaved RGB
`Uint8Array` frames). The generator set (`BUILT_IN_PRESETS`,
`IPatternPreset`) **moves** from `src/lib/features/poi/domain/pattern-preset.ts`
into the shared owner beside it. `features/poi` and `animation-engine` both
import from there. `StripPatternEngine`
(`src/lib/features/poi/services/strip-pattern-engine.ts`) keeps orchestrating
for the lab; the effect consumes the generators directly (it has no image
decode or hardware brightness-limit needs at runtime).

**Relationship declared:** Reuse + extend. The effect reuses `StripPattern`,
`getPixel`, and the generators; it extends the generator set with the spatial
patterns that finally have an axis (chase, comet). A
`canonical-capabilities.md` row records the ownership (see §8).

**Deleted** (the second implementation):

- `src/lib/shared/animation-engine/domain/patterns/` — evaluator registry,
  descriptor registry, all 22 evaluators, the 6-category taxonomy.
- The `TipEvaluationContext` plumbing in
  `src/lib/shared/animation-engine/services/led-tip-tracker.ts`; the tracker
  slims to an LED-position sampler (device → world-space LED positions +
  per-LED pattern color lookup).

### Pattern sources in the effect

1. **Generators** — existing five (solid, gradient, rainbow-sweep, pulse,
   prop-colors) plus spatial additions (chase, comet), curated to ~8 total.
   Every generator must be visually distinct from every other at thumbnail
   size; hue-window clones are banned.
2. **Image patterns** — the Poi Lab's Firestore image library
   (`src/lib/features/poi/services/poi-image-library.ts`), reused as-is.
   Uploaded POV images become effect looks. Guest/offline fallback: image
   source hidden when the library is unavailable; generators always work.

### Playback

```
frameIndex = floor(((elapsed / cycleDuration) % 1) * frameCount)
```

One clock shared by both props. `cycleDuration` (seconds per full pattern
loop) replaces the abstract 0.1–5.0 "speed" multiplier as the user-facing
control — same semantic as the Poi Lab's staff preview.

## 3. Config shape

```ts
interface LedOverlayConfig {
  device: LedDevice;
  pattern:
    | { source: "generator"; generatorId: string; params: PatternParams }
    | { source: "image"; libraryEntryId: string };
  /** Seconds per full pattern loop, clamped 0.2–30 (same range as the lab) */
  cycleDuration: number;
  look: {
    glowRadius: number;
    /** POV persistence: trail accumulation fade */
    trailFadeRate: number;
    bloomIntensity: number;
    /** 1–5, mapped through LED_BRIGHTNESS_LEVELS as today */
    brightness: number;
  };
}
```

Gone from v1: `patternId` (→ `pattern`), `patternSpeed` (→ `cycleDuration`),
`colorMode` / `blueHandColor` / `redHandColor` (prop identity is a pattern
concern — the `prop-colors` generator covers it), and the unused
`PropLedConfig` / `LedPoint` declarations in `led-types.ts`.

The pattern is materialized (generated or fetched) **once per config change**,
cached as a `StripPattern`, and sampled per frame. Generation is not in the
frame loop.

## 4. Presets and thumbnails

Presets become **device + pattern + look** bundles. Draft lineup (six; names
finalized during the visual pass; every preset must be distinguishable from
every other at tile size):

| Preset (working name) | Device | Pattern | Look notes |
| --- | --- | --- | --- |
| Capsule Classic | capsule | prop-colors (blue/red) | soft glow, short trail |
| Capsule Pulse | capsule | pulse | breathing brightness |
| Rainbow POV | pixel-staff 200 | rainbow-sweep | long persistence — the hero |
| Comet | pixel-staff 72 | comet/chase | asymmetric tail |
| Gradient Blade | pixel-staff 200 | gradient | mid persistence |
| Image showcase | pixel-staff 200 | curated built-in image | demonstrates the image source |

**Thumbnail:** new `LedThumbnail.svelte` routed in
`EffectPresetThumbnail.svelte` alongside bloom/fire/trails/coal. The
pattern-to-image conversion already exists as
`StripPatternEngine.toImageData()`; it is a pure transform, so it promotes to
a standalone function in the shared owner (the engine delegates to it, the
thumbnail imports it — no service dependency). The thumbnail paints the preset's actual
pattern along a stylized swing arc on a dark field with glow — a portrait of
what the preset paints in space, composed from the preset's own parameters,
legible at ~304×114. No live effect replay (that approach was tried for Bloom
and lost).

## 5. Rendering

**2D (both backends):**

- `src/lib/shared/animation-engine/services/led/web-gl-led-renderer.ts` —
  `MAX_LEDS` 32 → **400** (200 × 2 props). Instanced sprites; the instance
  buffer grows, the draw-call count does not. Trail accumulation and bloom are
  per-pixel passes, LED-count independent.
- `src/lib/shared/render-graph/services/web-gpu-led-executor.ts` — `MAX_LEDS`
  64 → **400**, same reasoning. `led-pass.ts` (the `led-translator.ts` was removed 2026-10-22) carries the
  device + sampled colors through the graph.
- Input contract change: `LedFrameInput` moves from "per-tip colors" to
  "per-LED positions + colors", produced by the slimmed sampler.

**3D:**

- **Capsule** keeps `src/lib/shared/3d/effects/led/led-renderer-3d.ts`
  (continuous ribbon trails — its sweet spot at 2 LEDs/prop).
- **Pixel staff** routes to the already-built
  `src/lib/shared/3d/effects/poi/pov-strip-renderer-3d.ts` (instanced trail
  ghosts, proven at 200 LEDs / 5,200 instances at HIGH tier). It is already in
  the shared 3D layer; the work is wiring the effect's config/playback into
  it, not moving or rewriting it. 400 rebuilt ribbons per frame was never
  affordable; reusing the POV renderer is the never-hand-roll answer.
- Quality tiers: LOW renders bulbs only (existing behavior); pixel-staff
  ghost density steps down with tier as the POV renderer already does.

## 6. Customize panel

`LedCustomize.svelte` stops being a thin wrapper around the 341-line
`LedPanel.svelte`; `LedPanel` is replaced. Target surface, top to bottom:

1. **Device** — `SegmentedControl` (Capsule / Pixel Staff), per
   `chip-primitives.md`. LED-count options (32/72/200) appear only for pixel
   staff, as a second small `SegmentedControl`. Space reserved so toggling
   device causes no layout shift (`no-layout-shift.md`).
2. **Pattern** — a visual grid of pattern cards, each card rendered from its
   own `StripPattern` data (same painter as the thumbnail, smaller). No text
   dropdown. Image-library entries appear in the same grid under a divider
   when signed in.
3. **Colors** — primary/secondary swatches, shown only when the selected
   generator consumes them (solid/gradient/pulse/prop-colors do;
   rainbow-sweep and images do not). Slot reserved.
4. **Speed** — one `cycleDuration` control.
5. **Look** — glow, persistence (trail fade), and the existing 5-level
   brightness buttons.

Roughly six visible controls. Everything else is gone, not hidden.

## 7. Migration

- Persisted v1 configs map to nearest v2: `solid` + color → capsule solid
  with that primary; `rainbow`/spectrum family → Rainbow POV; anything else →
  default preset. Unknown/missing → default preset. Migration is one pure
  function with unit tests.
- `led-presets.ts` (the four swatch presets) replaced by the §4 lineup.
- Evaluator/registry/descriptor files deleted in the same change that lands
  the replacement — no dead second implementation left behind.

## 8. canonical-capabilities.md row

| Search vocabulary | Owner and routing | Allowed presentations or exceptions |
| --- | --- | --- |
| LED pattern, strip pattern, POV image, pixel staff, LED preset, pattern generator | `shared/poi/domain/strip-pattern.ts` owns the pattern data model; the generator set beside it owns algorithmic patterns. The LED effect (animation-engine) and the Poi Lab both consume this owner. | The Poi Lab keeps its authoring surface (timeline, image upload, BLE/hardware upload). The effect keeps its playback surface (device + preset + look). Neither reimplements the other's generators or data model. |

## 9. Testing and verification

- **Unit:** LED position interpolation (capsule endpoints; pixel-staff lerp
  including N=1 guard), frame indexing / cycle wrap, generator output
  (distinctness: no two generators produce identical frames for default
  params), v1→v2 config migration.
- **Existing suites:** effect tests under `tests/unit/effects/` updated for
  the new config shape; scene-effects batching contract must stay green.
- **Visual (mandatory, per `visual-verification-mandatory.md`):** thumbnails
  in the preset row, the customize panel, and the running effect (2D and 3D,
  capsule and 200-LED staff) screenshotted at the required viewport set
  before any "done" claim. Effect preview surfaces use generated LOOPs per
  `sequence-generation.md`.

## Out of scope (explicitly)

- Hardware upload from the effect surface (stays in the Poi Lab; the shared
  currency makes a later "open in Poi Lab" bridge a small follow-up).
- Per-hand patterns / per-hand devices.
- Motion-reactive patterns (cut by identity decision, not deferred).
- Ignis TLV wire protocol work (`docs/reference/ignis-protocol.md` — blocked
  on USBPcap capture; unrelated to this rebuild).
- Poi Lab UI changes.

## Risks

- **Render-budget on low-end mobile at 400 instances + bloom:** mitigated by
  quality tiers (LOW = bulbs only, reduced ghost density) and by the fact the
  POV 3D renderer already ships at this scale.
- **Image-pattern auth dependency:** image source degrades to hidden when the
  library is unreachable; generators are always available.
- **Migration surprises:** the v1 config surface is small (11 fields, 4
  exposed); the mapping is total (unknown → default) so no config can brick
  the effect.
