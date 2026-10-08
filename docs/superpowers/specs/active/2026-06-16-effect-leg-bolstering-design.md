---
status: active
value: 2
effort: S
remaining: "Verify Effect Leg Bolstering — Design / Progress against src/lib/shared/effects/renderers/bloom-2d-renderer.ts before resuming implementation. Prior recorded remainder: '3 of 4 legs survive; Echo''s rework was deleted and replaced by Ghost'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Effect Leg Bolstering — Design / Progress

**Queue evidence (2026-10-07):** Three of four upgraded legs survive; Echo was removed and replaced by Ghost. See frontmatter for the remaining work.

> **DRIFT WARNING — 2026-08-02.** 3 of 4 legs survive; Echo's rework was **deleted** and replaced by Ghost
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Original status (historical):** In progress. Four legs upgraded and committed on `main`
(bloom, zap, echo, **pulse**). In-browser visual verification still owed for all
four. Re-assess the remaining cluster before the next leg.

**Owner context:** This is the resumable handoff. Austen is switching machines —
pull `main`, open this spec (it is the most recent by date prefix), and continue
from "Remaining work".

---

## Goal

Walk the 16 effect "legs" and lift the **weakest** ones from mediocre to
top-tier, one per round, picking the weakest remaining each time. Each upgrade
must keep the effect's unique observable (per `.claude/rules/effects-earn-their-slot.md`)
and reach the visual bar set by fire/water/frost/ink.

These are the **Canvas2D overlay effects** (`kind: "canvas2d"`), rendered per
frame over the animator surface. The 16 effects: trails, fire, led (these three
are `webgl`), then the 13 canvas2d ones — charcoal, zap, sparkles, echo, bloom,
water, bubbles, petals, smoke, ink, frost, silk, pulse.

## How "weakest" is judged

A leg is weak when it scores low on: **thinness** (LOC as a proxy), **motion
reactivity** (does it respond to prop velocity/energy, like every strong leg
does), **visual richness** (glow/depth/luminosity vs flat fills), and
**derivativeness** (does it duplicate another effect's observable). LOC is only
the first cut — read the renderer and judge reactivity + richness.

Strong legs (do **not** touch): fire (Navier-Stokes sim), water/frost/ink
(droplet/crystal/diffusion sims, 560–700 LOC), led (WebGL patterns), trails,
charcoal (WebGL spark pool w/ physics), silk/smoke/bubbles (velocity-advected
particle sims), sparkles/petals (particle pools w/ spawn modes + sprites).

---

## Completed this round

### 1. Bloom → **lens bloom**

Was the weakest: the only **stateless** effect — a radial gradient that breathed
with a sine, zero motion reactivity, most derivative (generic glow overlapping
fire halation / LED). Reclaimed the photographic meaning of "bloom":

- Colored halo + blown-out white-hot core, **anamorphic streak** (halo stretched
  along the motion vector, length ∝ speed), **diffraction star spikes**,
  **chromatic fringe** (R/B split on fast swings), **long-exposure afterglow**
  via an offscreen accumulation buffer (frame-based decay → deterministic for QR
  export; `OffscreenCanvas ?? createElement` with a direct-draw fallback when no
  offscreen 2D context, e.g. jsdom).
- Files: `src/lib/shared/effects/renderers/bloom-2d-renderer.ts` (+ test),
  `BloomCustomize.svelte`, `bloom-presets.ts` (Supernova/Comet/Prism/Halo),
  `BloomIntent` gained `streak`/`spikes`/`chromatic`/`afterglow`.
- Tuning follow-up (Austen feedback "high intensity overkill; default should
  prop-match"): default `intensity` 0.95→0.6, `colorMode` solid→prop-matched,
  with the **v16→v17** default-echo migration.
- Commits: `328a7ebacc` (renderer/config/presets/panel), `ea9d214a9a` (test
  fix — the commit shipped with the stale old test), `27780f6478` (tuning + v17).

### 2. Zap → **three discharge styles**

Was next weakest: thinnest renderer (187 LOC), **zero motion reactivity** (cached
a jagged line, regenerated on a timer). Rebuilt into three velocity-driven
styles (energy ∝ per-frame tip speed):

- **branching** (default): forking storm bolts between each blue↔red tip pair,
  white-hot core + colored corona (gradient stroke), multi-strike flicker, forks
  scale with the `branching` param + energy, terminal glows. Anchored fresh each
  frame (old cache lagged moving props).
- **plasma**: thick wobbling Tesla-coil conduits shedding a gravity-driven
  sputter-spark pool.
- **web**: live mesh across every tip, charge dots travelling the edges,
  cross-prop edges in violet.
- `ZapIntent` gained `style` ("branching"|"plasma"|"web"); legacy `mode`
  retained but inert. **v17→v18** (net-new field, no migration code). Customize
  Mode→Style selector (Branching slider gated to Storm); presets Storm/Tesla/Web.
- Direction-comparison sketch: `static/sketches/2026-06-14-zap-directions.html`
  (served at `/sketches/2026-06-14-zap-directions.html`).
- Commit: `5576041cb1`.

### 3. Echo → **luminous stroboscope**

Was next weakest: thinnest of the rest and **flattest** — solid strokes + filled
dots, no glow, no depth, no velocity reactivity. Kept the unique beat-lattice
concept (capture/cull/loop logic unchanged), rebuilt the drawing into light:

- Glowing staff (shadowBlur halo + white-hot core fading with age), tips as
  radiant orbs (radial gradient), **temporal depth** (older phantoms shrink +
  blur more), a **capture flash** (bright additive pop at the staff midpoint on
  the beat, expanding as it fades), and a **frozen motion smear** (per-end
  velocity captured at the beat draws faded offset copies — fast swing = blur).
- `EchoIntent` gained `glow`/`depth`/`flash`. **v18→v19** (net-new fields). The
  v6 echo seed in `migrations.ts` also gained them (typecheck caught this).
  Customize gains Glow/Depth/Flash sliders; presets reworked.
- Commit: `3f0c0b1391`.

### 4. Pulse → **pressure shockwave**

Re-confirmed weakest of the bottom cluster over sparkles/petals (both genuine
velocity sims): pulse computed tip speed but used it **only to gate spawning** —
every ring looked identical regardless of the motion that birthed it. Rebuilt so
each ring captures `birthEnergy` (px/frame vs `REF_ENERGY_SPEED = 22`, zap
precedent) + travel direction at spawn and encodes them:

- **velocity → size + brightness** (`velocityScale`), **Mach-cone deform** with a
  base directional floor + energy term (`asymmetry` — a high-asym preset reads as
  a teardrop even at rest, deforms harder on fast swings; this fixed the
  "presets only differ on hard hits" flaw), eased expansion, **white-hot leading
  wedge over a deformed band fill** (glow) / thin stroke (stroke), **detonation
  flash** at the origin, **chromatic fringe** on high-energy rings, and a
  **frame-clock-scheduled harmonic overtone train** (`harmonics` → `round(·*3)`
  trailing rings; carries Heartbeat's paired thump and Ripple's concentric trains
  with one knob).
- **PERF constraint discovered in the sketch:** no per-segment `shadowBlur` (it
  tanked the frame rate). The hot front is band fill + one stroke + a short wedge.
  Also calibrate energy reference to real px/frame or the deform never fires.
- `PulseIntent` gained `velocityScale`/`asymmetry`/`chromatic`/`flash`/`harmonics`.
  **v19→v20**; default `style` flips `stroke→glow` with a default-echo remap.
  Presets **6→4** (kept Sonar/Shockwave/Heartbeat/Ripple; removed Radar/Void —
  removed preset ids read as Custom, no config break). Customize gains 5 sliders.
  New `pulse-2d-renderer.test.ts` (energy→size, asym deform, no-shadowBlur,
  harmonic train).
- Spec: `docs/superpowers/specs/2026-06-17-pulse-shockwave-design.md`. Sketches:
  `static/sketches/2026-06-16-pulse-shockwave.html`,
  `static/sketches/2026-06-17-pulse-scope.html`. Commit: `74acf67b92`.

### Related prior work this session (context)

- **Fire activation freeze fix**: the click that enabled fire stalled ~1s on
  synchronous WebGL shader compile. Switched
  `src/lib/shared/animation-engine/services/fire/web-gl-fire-renderer.ts` to
  `KHR_parallel_shader_compile` (kick off all compiles, poll the non-blocking
  `COMPLETION_STATUS_KHR`, resolve uniforms only when done; headless/export path
  finalizes synchronously). Plus a deferred-init pass in
  `effect-renderer-manager.ts`. Commits `1708569562`, `853a37cddb`.
- **Effects preset data consolidation** (earlier): presets are data-first
  (`patch`/`resolvePatch`), single-undo `applyPreset`, see
  `2026-06-04-effects-preset-data-consolidation-design.md`.

---

## The upgrade recipe (follow for each new leg)

Every canvas2d effect has the same surface. To bolster one, touch these and
nothing else:

1. **Intent** — add fields to `<Effect>Intent` in
   `src/lib/shared/effects/domain/effects-config.ts`, and **bump
   `EFFECTS_CONFIG_VERSION`** (currently **20**).
2. **Defaults** — add the new fields to `DEFAULT_EFFECTS_CONFIG.<effect>` in
   `src/lib/shared/effects/domain/defaults.ts`.
3. **Migration** — in `src/lib/shared/effects/domain/migrations.ts`: net-new
   fields need only a `// vN → vN+1` doc comment (the final
   `<effect>: { ...DEFAULT.<effect>, ...input.<effect> }` merge fills them). A
   **changed default** that should reach existing configs needs a default-echo
   remap (see the v16 LED brightness and v17 bloom remaps — only remap a
   persisted value equal to the OLD default). **Watch for full-intent literals
   elsewhere** (translator tests; the v6 echo seed) — new required fields break
   them; the cold typecheck catches it.
4. **Translator** — `resolveX2D` in `canvas2d-translator.ts` is a pass-through
   (`...intent`); usually no change. Params type extends the intent in
   `canvas2d-types.ts`.
5. **Renderer** — `src/lib/shared/effects/renderers/<effect>-2d-renderer.ts`.
   Signature is `render(ctx, params, tips, scale)`. The overlay clears each
   frame; stateful effects keep their own buffers/pools across frames.
   **Velocity:** the overlay passes no `dt`/prev positions — track previous tip
   positions internally and use per-frame deltas (see bloom/zap/echo). **QR
   export determinism:** keep decay/aging frame-based, not wall-clock (the
   worker renders frames back-to-back). `Math.random` for jitter is acceptable
   (zap was never deterministic).
6. **Customize panel** — `…/effects-panel/customize/<Effect>Customize.svelte`.
   Match the sibling pattern (raw chip rows for selectors, slider-rows for 0–1
   params). Gate style-specific controls with `{#if}`.
7. **Presets** — `…/effects-panel/presets/<effect>-presets.ts` (data-first
   `patch`). Keep `<effect>-custom` with `patch: {}`. Update `getSummary`.
8. **Test** — `<effect>-2d-renderer.test.ts`. The fake ctx must implement every
   ctx method the new renderer calls (`createRadialGradient`, `shadowBlur`,
   `fillRect`, `quadraticCurveTo`, etc.) or it throws.

### Verification discipline

- `npx vitest run <the touched test files>` — fast inner loop.
- **One** cold `npm run check > /tmp/check.log 2>&1` per turn at the commit gate;
  grep the log, don't re-run. Adding required intent fields almost always breaks
  one full-literal construction site — fix it.
- The shared git index has many in-flight files from other agents. **Commit with
  an explicit pathspec** (`git commit -m … -- <your files>`), never a bare
  `git commit`. Confirm `git diff HEAD --stat -- <shared files>` shows only your
  hunks before committing.
- Persistent unrelated repo errors that are NOT ours (leave them): a
  `profile-redesign` `SoloPropData→PropType` cast, a `premium_checkout_error`
  i18n key, `SocialModule` lazy-import mismatches, `MusicPlayer.onError`,
  `SequenceThumbnail`/`WriteTab` types.

---

## Remaining work

### In-browser verification owed (do first on desktop)

Cannot be verified without the running app. Open each effect in the animation
panel where fire was tested and confirm:

- **Bloom**: white-hot core + star spikes; streak stretches on fast swings; RGB
  fringing on quick moves; afterglow trail lingers. Try Comet/Supernova presets.
- **Zap**: cycle Storm/Plasma/Web; bolts fork + brighten with speed; Plasma
  sheds falling sparks; Web wires all four tips with travelling charge dots.
- **Echo**: phantoms glow, tips are orbs, older ghosts recede, each beat flashes,
  fast swings smear. Try Pulse/Twin Ghosts presets.

If any layer runs hot, every new knob is a 0–1 slider — retune defaults/presets.

### Next leg: re-assess

Pulse is done. The remaining canvas2d effects are largely the strong sims marked
"do not touch" up top (water/frost/ink/silk/smoke/bubbles particle/diffusion
sims; sparkles + petals are genuine velocity sims with pools, spawn modes,
sprites). Before picking a 5th leg, re-read the bottom of the cluster against the
reactivity/richness criteria and confirm there is still a genuinely weak leg
worth a full rebuild — the walk may be approaching done. If one is found, apply
the recipe above.

### Open question

`ZapIntent.mode` and (potentially) `BloomIntent.falloff` interplay are now
partly legacy. A later cleanup pass could migrate `mode` out entirely — deferred
to avoid migration churn while the effects are still being reworked.
