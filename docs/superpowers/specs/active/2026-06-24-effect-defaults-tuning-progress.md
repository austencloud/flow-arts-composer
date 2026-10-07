---
status: active
value: 4
effort: XL
remaining: "Verify Effect Defaults Tuning Campaign — IN PROGRESS against the current Effect Defaults Tuning Campaign — IN PROGRESS runtime and acceptance criteria before resuming implementation. Prior recorded remainder: Infrastructure and bloom tuning are complete. Remaining: build shared 1/sqrt(N) normalization for bloom/echo/pulse/zap, add the all-presets overview, then tune and visually verify 15 effect families in both Clean and Tunnel scenes. Resume with echo/pulse/zap after Chrome DevTools MCP is available."
depends_on: "external: Chrome DevTools MCP is unavailable in this Codex session; every remaining tuning decision requires live Clean/Tunnel visual proof"
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Effect Defaults Tuning Campaign — IN PROGRESS

**Date:** 2026-06-24
**Status:** 🟡 In progress — infrastructure complete, bloom substantially tuned, 15 effects pending
**Surface:** `/test/effect-tuner` (dev-only harness)

## Goal

Pick sensible shipped defaults for all 16 effects — both the **base default**
(`DEFAULT_EFFECTS_CONFIG[<effect>]` in `defaults.ts`) and each effect's
**presets** (`<effect>-presets.ts`). Every value users see out of the box should
look right in a single clean read AND survive additive overlap.

The 16 effects: `trails, fire, led, charcoal, zap, sparkles, echo, bloom, water,
bubbles, petals, smoke, ink, frost, silk, pulse`.

## Method

- Tune in the tuner against **two scenes off the same motion**: **Clean** (single
  blue+red pair, honest single-effect read) and **Tunnel** (rotated/mirrored
  kaleidoscope, additive-overlap stress gate). Lock a value only if it survives both.
- **Surgical** — start from the current default, change only params that read
  wrong. No full-param sweep.
- Save directly from the tuner (no copy/paste relay). The picker chooses the
  write target; saves land in `defaults.ts` or a preset file.

## Infrastructure — COMPLETE

- **Tuner harness** — gallery layout (real prop sidebar · big stage · real
  production `EffectsPanel`), Clean/Tunnel toggle, isolated `persist:false`
  config. Design: `active/2026-06-23-effect-tuner-design.md`.
- **Save-target picker** — sticky "Save to:" dropdown (`FilterChipBase`) listing
  Base default + the effect's presets (Custom excluded). Holds its own target so
  a slider tweak never silently retargets the base. Design:
  `2026-06-24-effect-tuner-preset-editing-design.md`.
- **Dev write-back endpoint** (`save-default/+server.ts`) — dispatches on a
  `target` discriminator: `"default"` patches `defaults.ts`; `{ preset }`
  replaces that preset's `patch` block in `<effect>-presets.ts`. Pure,
  unit-tested string transforms in `save-default/patch-source.ts` (16 tests).
  Full-patch semantics: a preset save stores every field shown.
- **Bloom perceptual intensity gamma** — `INTENSITY_GAMMA = 2.6` in
  `bloom-2d-renderer.ts`. The additive lens stack saturates ~0.15 alpha, so the
  linear slider blew out by 15%; the gamma curve makes the slider perceptually
  linear (midpoint ≈ 16% alpha, full blowout still at 100%).

## Per-effect progress

| Effect | Base default | Presets | Notes |
|---|---|---|---|
| trails | shipped (global default, on) | — | not part of this sweep yet |
| **bloom** | ✅ tuned (see below) | ✅ retuned | gamma + radius-range done |
| fire | pending | pending | `intensity 0.7` sits uncommitted (provenance unclear — see loose ends) |
| led | pending | pending | preset-unification decision open (below) |
| charcoal, zap, sparkles, echo | pending | pending | echo/zap also need the additive normalization |
| water, bubbles, petals, smoke, ink, frost, silk | pending | pending | pooled family — already tip-count-stable |
| pulse | pending | pending | additive — needs normalization |

## Bloom — current locked values

**Base default** (`defaults.ts`, committed `b93950b0a5`):

```
intensity: 0.5,     radius: 36,        color: "#f472b6",
palette: ["#f472b6", "#fbbf24", "#22d3ee"],
colorMode: "rainbow",   falloff: "smooth",   pulse: 0,   pulseRate: 1,
streak: 0.4,    spikes: 0.65,    chromatic: 0.35,    afterglow: 0.5,
```

**Radius slider range** (manifest, committed `f6ebbe9be4`): `min 8 · max 90 ·
step 2` (was max 200 — 200px went wall-to-wall). 50px now sits mid-track.

**Preset radii** (committed `ac2e25050e`, all under the 90 ceiling): Supernova
50 · Comet 44 · Prism 30 · Halo 32 (plus other field tweaks saved from the tuner).

**Open bloom decision:** base default radius is **36**; 50 would be the slider
midpoint ("50px = medium" was the framing). Keep 36 or bump to 50 — user's call,
deferred ("we'll deal with it").

## Locked decisions, NOT yet built

1. **Tip-count-aware additive normalization (1/√N).** Renderers split into two
   camps:
   - **Pooled** (sparkles + liquid family: water, bubbles, petals, smoke, ink,
     frost, silk) — a global particle-pool cap already makes them tip-count-stable.
   - **Additive non-pooled** (bloom, echo, pulse, zap) — apply full per-tip alpha,
     so N tips = N× brightness; they blow out with tip count AND tunnel layers.
     These need a **1/√N** scale (N = visible tip count; staff=2, doublestar=4,
     fan/quiad=4, hoop=5, max 5).
   Decision: one consistent default per effect + smart renderers, NOT per-prop
   defaults (per-prop changes settings invisibly when the user switches props).
2. **Promote the bloom gamma to a shared `perceptualIntensity()` helper** and
   apply it to echo/pulse/zap intensity when those effects get tuned (today it's
   a bloom-local constant — correct to inline for one call site, factor on the
   second).

## Known loose ends / hazards

- **`fire.intensity 0.5→0.7`** sits uncommitted in `defaults.ts` — unclear if
  it's this session's tuning or another agent's. Left unclaimed; commit it if it's ours.
- **Shared git index is loaded** with another agent's large store/merch refactor
  (staged, uncommitted, ~40 files incl. store/admin deletions). **No bare
  `git commit` from any agent** — it would sweep all of it. This session's commits
  are all path-scoped to avoid that; keep doing that.
- **First preset save normalizes formatting** — numbers lose trailing `.0`
  (`1.0`→`1`) and fields reorder to live-intent order. Cosmetic, harmless, but the
  first diff per preset can be larger than expected.

## Next steps (pickup order)

1. Resolve bloom base radius 36 vs 50; commit fire if it's ours.
2. Pick the next effect to tune (suggest the other additive ones — echo, pulse,
   zap — so the 1/√N normalization can be built once and shared).
3. **Build the 1/√N additive normalization** for bloom/echo/pulse/zap.
4. **LED / all-presets overview** — user wants to SEE every effect's presets laid
   out before deciding preset unification (LED had special plans; others may
   collapse to ~4–6 presets each). Unbuilt; an overview mode in the tuner is the
   proposed vehicle.
5. Sweep the remaining effects (Clean + Tunnel each).

## Commit trail (this campaign)

- `b5bc1624fe` — bloom perceptual gamma + curve-lock tests
- `9f88d8d933` — preset+base editing design spec
- `feb4b9b943` — pure patch-source module (16 tests)
- `66273ebe2c` — endpoint dispatches to defaults or a preset
- `3b81b0d4be` — save-target picker UI
- `f6ebbe9be4` — bloom radius slider max → 90
- `ac2e25050e` — bloom presets retuned under 90
- `b93950b0a5` — bloom base defaults lowered
- (earlier: `01fbb90ee2` tuner design spec + the route/gallery/prop-sidebar commits)

## Cross-references

- Tuner harness design: `docs/superpowers/specs/active/2026-06-23-effect-tuner-design.md`
- Preset + base-default editing design: `docs/superpowers/specs/2026-06-24-effect-tuner-preset-editing-design.md`

## Queue re-triage (2026-07-30)

Fifteen visual tuning passes, a shared renderer normalization change, an overview
surface, and two-scene proof for every effect is XL residual scope. The previous
M estimate made this campaign outrank completable work. No tuning was attempted
without the required Chrome DevTools surface.
