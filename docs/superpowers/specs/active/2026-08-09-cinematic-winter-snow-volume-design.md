---
status: active
value: null
effort: null
remaining: "Confirm the snow-volume release gate, 4K benchmark, and visual review still apply to the current Winter renderer."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: verification
---
# Cinematic Winter Snow Volume

Status: Implemented, verified, and integrated in `@austencloud/backgrounds`
0.7.5 after Opus 5 review, foreground-atlas refinement, and pointer-wake
continuity correction.

## Outcome

Turn the existing 2D snowfall into a convincing volume of snow around the
viewer. Distant powder, detailed middle-distance crystals, and large soft
foreground flakes must occupy distinct visual depths while remaining part of
one continuous wind field.

Snow remains the subject. The scene gains no horizon, snowbank, terrain, trees,
animal, building, or other scenic object. The fixed winter sky remains behind
the snow.

The result should feel like standing inside snowfall rather than watching
snowflake symbols travel across a screen.

## Current gap

The living-winter pass already provides the correct mechanical foundation:

- one coherent curl-and-gust wind field;
- depth-scaled particle response;
- pointer wakes;
- eased pointer parallax;
- a snow-only cursor light;
- restrained glints;
- touch flattening and reduced-motion behavior.

Every flake is still rendered with the same crisp stroked `Path2D` language.
Size, opacity, and parallax vary by depth, but focus does not. A close flake and
a distant flake therefore look like scaled versions of the same mark.

Autumn's current 2D treatment exposes the difference. It moves separate far,
middle, and near art planes through one shared `DepthParallaxTracker`. Winter
already uses that tracker in the current shared-package working tree, but it
has only one optical treatment.

## Creative contract

### Three readable snow bands

Each particle receives one stable optical class when it is created. The class
does not change while the particle crosses the viewport.

| Band       | Visual treatment                               | Motion character                     | High-quality share |
| ---------- | ---------------------------------------------- | ------------------------------------ | -----------------: |
| Powder     | Tiny soft grains with low contrast             | Slow, broad flow                     |          50 to 58% |
| Crystal    | Current detailed six-point flakes              | Clear falling and tumbling           |          32 to 40% |
| Foreground | Large, translucent, partially defocused flakes | Strongest parallax and gust response |           8 to 12% |

The percentage ranges describe the population, not equal visual weight.
They are pre-cap targets. When a foreground cap binds, its remainder is
redistributed across powder and crystal; measured gates use the capped targets.
Foreground snow must remain sparse.

### Powder

- Powder ranges from roughly 0.6 to 2.2 CSS pixels at a 1x backing scale.
- Powder never renders below 0.8 device pixels. Below that floor, radius holds
  at 0.8 device pixels and alpha decreases proportionally. Positions remain
  fractional rather than snapping to integer pixels.
- It uses low opacity and cool gray-blue values rather than pure white.
- Powder may batch into a small number of paths by opacity bucket.
- Neighboring powder particles must reveal the broad wind field without
  forming obvious rows, clumps, or repeating waves.
- During a gust, powder stretches only enough to reveal direction. It must not
  turn into rain.

### Middle-distance crystals

- Preserve the current procedural six-point crystal family and its stable
  per-particle shape.
- Keep the cursor-light facet response and rare glints.
- Maintain crisp centers and delicate branches at normal display scale.
- Rotation, brightness, and branch geometry remain stable from frame to frame.
- A broken optics asset must never remove this band.

### Foreground snow

- Foreground flakes range from roughly 20 to 84 CSS pixels on wide desktop
  viewports and 16 to 48 CSS pixels on narrow screens.
- Their edges are soft, but their internal structure remains faintly readable.
  They must not resemble soap bubbles, lens dust, flower petals, or fog discs.
- Most enter through the outer 22 percent of the viewport. One weighted
  horizontal-birth function must serve both initial creation and recycling. A
  small minority may cross the central field so the depth does not look staged.
- A flake may begin partly outside the viewport. Clipping at the screen edge is
  desirable because it implies a larger object passing close to the viewer.
- Foreground opacity stays low enough that one particle cannot hide a control,
  pictograph, or face for more than a brief moment.
- No more than 14 foreground flakes may be active on a wide high-quality
  viewport. Portrait high quality caps at 8.

### The frame still breathes

The existing automatic gust schedule remains the weather clock. No second
random weather scheduler is added.

The visual bands respond to the same gust front:

- powder makes the leading edge readable;
- crystals tilt and accelerate with the current smoothed velocity;
- foreground flakes travel farther and brighten less than hero crystals;
- the field returns to its calm distribution without a visible population
  jump.

Particle count must not spike when a gust begins. The squall is revealed by
motion, optical depth, and existing particles crossing at different speeds.

## Composition and legibility

The background serves screens with very different content placement. It cannot
reserve one hard-coded empty rectangle.

- Distant powder and middle crystals may use the full viewport.
- Large foreground births favor the outer frame.
- The middle 46 percent of the viewport width receives at most 35 percent of
  foreground births over a long deterministic sample.
- Edge bias must not produce empty vertical lanes or a visible rectangular
  mask.
- The fixed gradient remains untouched by parallax and cursor light.
- The cursor light illuminates snow only. No circular halo may appear on the
  sky.
- Shooting stars remain available and keep their existing quality gate. The
  snow-volume work does not add another celestial effect.

## Optical asset

Create one original transparent WebP atlas for near-field snow optics:

`static/images/backgrounds/winter/snow-optics.webp`

The atlas contains at least eight distinct crystal silhouettes across crisp,
half-focus, and soft-focus cells. It must include no text, border, background
color, stock imagery, or externally licensed material.

Atlas requirements:

- maximum dimensions: 1024 by 1024 pixels;
- compressed file size target: 512 KiB or less;
- each cell has at least 192 pixels of native resolution and at least 12 pixels
  of transparent padding;
- no cell is drawn above 1.25 times its native dimensions;
- alpha around every cell must be clean at dark and light winter values;
- cell geometry and source rectangles live in one typed winter-owned module;
- the same crystal must not appear in adjacent focus cells with mismatched
  rotation or branch structure;
- medium and high quality decode the atlas once;
- low quality does not request it.

The package loads the atlas from the consumer-served runtime URL
`/images/backgrounds/winter/snow-optics.webp`, declared once in the typed
winter-owned atlas module. TKA serves that URL from
`static/images/backgrounds/winter/snow-optics.webp`. One orientation-neutral
atlas serves every viewport. Loading and failure metrics follow the existing
Autumn scenery-loader convention.

The current procedural `Path2D` renderer is the loading and failure fallback.
Until the image is decoded, the scene remains complete and animated.

Runtime `ctx.filter` and per-particle `shadowBlur` are prohibited. Blur is
baked into the atlas. This avoids a 4K blur pass for every foreground flake and
does not depend on the uneven browser support of
`CanvasRenderingContext2D.filter`.

## Capability ownership

### Extend

`SnowflakeSystem` continues to own:

- particle creation and recycling;
- position, velocity, rotation, and wind integration;
- quality-dependent population;
- pointer wake input;
- resize distribution;
- reduced-motion state.

It gains stable optical metadata and delegates drawing to one winter renderer.
It also maintains three readonly index views, one per optical class. The views
are rebuilt only after initialization, resize, or quality change, and remain
depth-ascending inside each band. `SnowVolumeRenderer` iterates those views
without sorting, filtering, or partitioning the particle array per frame.

`SnowflakeSystem` owns one weighted horizontal-birth function used by initial
creation and recycling. Powder and crystal births remain uniform. Foreground
births use the edge-weighted distribution, and the long-sample center-share
criterion applies to recycled births as well as the initial population.

Resize must preserve the volume instead of truncating the depth-sorted array.
Shrink removes particles from each band in proportion to its target share.
Growth creates preclassified particles against the new viewport's ratios and
caps. Foreground caps are recalculated for width and orientation on every
resize. Surplus foreground particles retire off-screen or fade over at least 30
frames rather than disappearing in one frame.

### Reuse

- Reuse `DepthParallaxTracker` for all three snow bands. Winter injects an
  explicit profile with a 64-pixel horizontal maximum and 34-pixel vertical
  maximum while retaining the tracker's default ratios. Do not edit the shared
  default profile, restore `WinterParallaxTracker`, or add another tracker.
- Reuse `WinterWindField`; no second force field or gust scheduler is allowed.
- Reuse `WinterCursorLightTracker`; it remains the only cursor-light owner.
- Follow the `FishSpriteManager` and tree-rendering convention for decoded or
  offscreen image caching and HTML canvas fallback behavior.

### Create

Create `SnowVolumeRenderer` as the sole owner of snow focus-band drawing. The
name states what the class does and avoids a generic `Service` or `Manager`
suffix.

`SnowVolumeRenderer` owns:

- optics-atlas loading and cell lookup;
- powder batching;
- crystal, powder, and foreground draw treatments;
- quality-specific optical features;
- fallback rendering when the atlas is unavailable;
- render statistics needed for verification.

It does not own particle motion, wind, parallax input, pointer tracking, or
quality selection.

### Discovery evidence

Internal searches covered `sprite atlas`, `texture atlas`, `OffscreenCanvas`,
`shadowBlur`, `Path2D`, `parallax`, and `focus`.

Closest owners:

- `FishSpriteManager` owns reusable offscreen fish sprite creation.
- Forest and Blossom tree systems cache expensive static drawing work.
- `DepthParallaxTracker` owns shared pointer viewpoint behavior.
- Autumn owns art-plane parallax, not snow optics.
- `SnowflakeSystem` owns winter particle physics and current drawing.

No existing owner renders focus-separated snow. `SnowVolumeRenderer` is a new
winter presentation owner, not a parallel particle system.

No external runtime dependency is needed. Canvas 2D already supplies the
required image cropping, alpha compositing, rotation, and scaling.

## Data model

Extend `Snowflake` with stable, flat visual fields assigned only during
creation:

```ts
type SnowOpticalClass = "powder" | "crystal" | "foreground";

interface Snowflake {
  // Existing motion fields remain unchanged.
  opticalClass: SnowOpticalClass;
  opticalVariant: number;
  opticalFocus: number;
  opticalScale: number;
  opticalAlpha: number;
}
```

The final field names may follow the surrounding model style, but the contract
is fixed:

- no random choice occurs inside `draw`;
- `opticalVariant` stays within the atlas or procedural-variant bounds;
- `opticalFocus` is clamped from 0 to 1;
- `opticalScale` and `opticalAlpha` are finite and positive;
- depth remains the source for wind and parallax response;
- optical class survives resize and ordinary recycling.

`createSnowflakeSystem(options?: { random?: () => number })` threads one random
source through particle creation, classification, recycling, and
`WinterWindField`. Classification helpers are pure functions of depth,
viewport, quality, and that source. Tests inject a counter-based generator and
never stub `Math.random`. Do not introduce a global seeded-random framework.

## Rendering path

1. `WinterBackgroundSystem` draws the fixed gradient.
2. `SnowflakeSystem` updates every particle through `WinterWindField`.
3. `DepthParallaxTracker` resolves the draw offset from the particle depth.
4. `WinterCursorLightTracker` resolves snow-only light intensity.
5. `SnowVolumeRenderer` draws powder back to front, then crystals, then
   foreground optics.
6. The existing shooting-star pass retains its current ordering unless visual
   review proves a specific overlap is wrong.

Powder uses three fixed opacity buckets. The renderer allocates their reusable
state during initialization, then issues one `beginPath()` per bucket and adds
subpaths through the existing context each frame. It does not construct a
canvas, image, gradient, `Path2D`, or atlas structure during the frame loop.

Foreground atlas cells use `drawImage` source rectangles. Nonuniform scaling
may express mild gust motion, but the long axis may not exceed 1.35 times the
short axis. This cap prevents snow from becoming streaked rain.

## Pointer light by band

- Powder receives a broad, faint lift with no glint rays.
- Crystals retain the current facet response and rare sharp glints.
- Foreground snow receives a soft alpha lift. It does not receive sharp glint
  crosses because a defocused object cannot produce a crisp screen-space star.
- Resolved light equals the tracker intensity multiplied by a renderer-owned
  band response: 1.0 for crystal, 0.55 for powder, and 0.35 for foreground.
- Large foreground flakes sample the tracker at the center and at two points
  offset by 0.4 times their render scale along the long axis, then use the mean.
  This prevents a large flake from blinking as its center crosses the light
  boundary.
- `WinterCursorLightTracker` keeps sole ownership of position, easing, radius,
  and its existing depth curve. Band weighting lives in `SnowVolumeRenderer`.
- At zero resolved light intensity, the renderer must not enter additive
  compositing for that particle.

## Accessibility and input

### Touch

Touch keeps the three-band composition but disables pointer parallax and
cursor light. Touch movement must not disturb the wind field.

### Reduced motion

Reduced motion:

- disables pointer parallax, cursor wakes, automatic gusts, and cursor light;
- stops foreground births immediately and fades active foreground flakes over
  20 frames;
- retains a sparse powder and crystal fall with the existing faint ambient
  drift.

### Mouse and pen

Mouse and pen receive the complete treatment. Pen input follows the same
parallax and light behavior as mouse input. Pointer speed may influence the
existing wake, but it does not change optical-class population.

## Quality tiers

| Feature             | High                       | Medium                    | Low                   |
| ------------------- | -------------------------- | ------------------------- | --------------------- |
| Powder              | Full                       | Reduced                   | Reduced simple grains |
| Procedural crystals | Full                       | Full                      | Current renderer      |
| Foreground optics   | Up to 14 wide / 8 portrait | Up to 6 wide / 4 portrait | Off                   |
| Optics atlas        | Loaded                     | Loaded                    | Not requested         |
| Cursor glints       | Current rate               | Reduced rate              | Off                   |
| Gust stretch        | Full capped treatment      | Crystal and powder only   | Off                   |

`setQuality` recomputes population targets and band caps. Counts converge by at
most 5 percent of the target population per frame. New particles begin
off-screen; retired particles leave off-screen or fade. The atlas is first
requested on transition into medium or high and remains cached after a
downgrade.

Winter thumbnail mode is not part of this work. A future controller may force
low quality through the existing quality path, but it must not add a separate
thumbnail renderer.

## Performance contract

Before implementation, record the current winter `update + draw` average and
p95 at 3840 by 2160. The evidence names the CPU, GPU, browser build, package
commit, and sample harness. At the same viewport with high quality after a
five-second warm-up:

- average winter `update + draw` time is at most 2.0 ms on the development
  machine;
- p95 `update + draw` time is at most 4.0 ms;
- average time does not exceed 1.6 times the recorded baseline;
- p95 does not exceed 1.8 times the recorded baseline;
- frame-time sampling runs for at least 600 frames;
- no per-frame canvas, image, gradient, `Path2D`, or atlas allocation occurs;
- no runtime blur filter is used;
- atlas decode occurs once per system lifetime;
- particle values remain finite through a gust, pointer wake, resize, and
  quality change.

Existing per-particle object churn in `SnowflakeSystem.update` is outside this
allocation clause. New optical metadata stays flat so it does not add nested
object allocation. If the budget fails, reduce foreground count and powder
batching cost before removing the three-band composition.

## Failure behavior

- Atlas loading failure keeps procedural snowfall visible.
- `WinterBackgroundSystem` implements `getMetrics(): PerformanceMetrics`,
  reporting particle count plus `winter-optics-loading` while the atlas is
  loading and `winter-optics-failed` after a confirmed failure. Its metric shape
  follows `AutumnBackgroundSystem.getMetrics()`.
- A retry may occur after an aspect-neutral system reinitialization, but not on
  every frame.
- Invalid atlas-cell metadata falls back to the procedural crystal renderer for
  that particle.
- Context loss follows the existing background controller lifecycle. This work
  does not create a second recovery system.

## Implementation scope

Shared backgrounds package:

- `packages/backgrounds/src/backgrounds/winter/domain/models/winter-models.ts`
- a winter-owned pure optical-classification module and focused test;
- `packages/backgrounds/src/backgrounds/winter/services/SnowVolumeRenderer.ts`
- `packages/backgrounds/src/backgrounds/winter/services/SnowVolumeRenderer.test.ts`
- `packages/backgrounds/src/backgrounds/winter/services/SnowflakeSystem.ts`
- `packages/backgrounds/src/backgrounds/winter/services/SnowflakeSystem.test.ts`
- `packages/backgrounds/src/backgrounds/winter/services/WinterBackgroundSystem.ts`
- a typed winter atlas/constants module containing the runtime URL, source
  rectangles, and values genuinely shared by creation and rendering.

TKA application:

- `static/images/backgrounds/winter/snow-optics.webp`
- `static/test-winter-wind.html`
- the installed `@austencloud/backgrounds` version and lockfile after visual
  approval and package publication.

No BackgroundHost change is expected. It already forwards pointer type through
the public package API.

## Tests for silent failures

Focused deterministic tests must prove:

- optical-class ratios remain within their quality-tier ranges;
- foreground count caps hold for wide and portrait viewports;
- foreground birth weighting favors the outer frame without empty lanes;
- visual variant and focus values remain stable across updates;
- drawing consumes no random values;
- resize keeps positions, scales, and atlas indices finite and valid while
  preserving target shares instead of truncating the foreground band;
- gust stretch stays within its aspect-ratio cap;
- touch disables parallax and light without removing normal snow depth;
- reduced motion stops foreground births and gust response, then fades active
  foreground over 20 frames;
- low quality never requests the atlas;
- an atlas failure preserves procedural snow and reports the correct metric;
- pointer-light falloff differs correctly by optical class;
- quality changes converge to the correct band counts without one-frame spikes.

Do not add pixel-golden unit tests for the final image. A visibly broken image
is not silent. Visual composition belongs to browser review.

## Approval gates

The first visual gate uses the standalone winter preview and pauses before
package publication. Austen reviews the result before integration.

Capture and inspect:

1. Calm snow at 1920 by 1080.
2. Active gust at 1920 by 1080.
3. Pointer light over mixed snow bands.
4. A foreground flake partly clipped by an edge.
5. Reduced motion at 1920 by 1080.
6. Final composed frames at 2560 by 1440, 3840 by 2160, 1440 by 900,
   820 by 1180, 960 by 412, and 375 by 667.

### Measured gates

- Per-band counts remain within 10 percent of their target at every captured
  viewport after convergence.
- Foreground counts never exceed the quality and orientation caps.
- Foreground gust aspect ratio never exceeds 1.35.
- No more than 35 percent of 5,000 deterministic foreground births land in the
  middle 46 percent of viewport width.
- A pixel comparison with the pointer parked over empty sky shows zero sky
  change. Only snow pixels may respond to cursor light.

### Human judgment gates

Austen rejects the visual pass if:

- foreground snow resembles bubbles or petals;
- the center is repeatedly covered by large flakes;
- the atlas repeats are easy to identify;
- a gust reads as rain, confetti, or a horizontal wipe;
- the cursor produces a visible sky halo;
- snow layers expose a rectangular density mask;
- the fixed sky moves;
- any viewport feels substantially emptier than the current winter scene;
- the effect competes with application controls or notation.

After visual approval, verify the installed package in the real
`BackgroundHost`, check the browser console, run the package tests and build,
run the TKA project check, and repeat the performance sample against the
published artifact.

## Verification record

- The standalone preview passed visual review at 1920 by 1080, 2560 by 1440,
  3840 by 2160, 1440 by 900, 820 by 1180, 960 by 412, and 375 by 667. Pointer,
  gust, touch flattening, edge clipping, and reduced-motion states were also
  inspected.
- The uncontended 3840 by 2160 benchmark used 300 warm-up frames and 600
  measured gust frames. Version 0.7.2 measured 1.8535 ms average and 3.0 ms
  p95. The implemented renderer measured 1.3805 ms average and 2.3 ms p95,
  ratios of 0.745 and 0.767 respectively.
- Later installed-package samples ran while unrelated 3D verification scenes
  were active in the shared Chrome process and were rejected as contaminated.
  The installed `SnowflakeSystem.js` and `SnowVolumeRenderer.js` hashes match
  the passing build byte for byte.
- The clean release archive passed 71 tests, TypeScript build and no-emit
  checks, `publint`, and tarball inspection. The broader dirty-checkout package
  run passed 101 tests. TKA `svelte-check` completed with zero errors and zero
  warnings.
- The foreground atlas refinement replaced both soft-focus rows with branched
  six-point crystals and samples their eight variants with a 70/30 split. Opus
  rejected the first pass for flower-like silhouettes, then passed the corrected
  atlas at all seven target viewports with no edge bleed or console errors.
- The 1024 by 1024 RGBA atlas is 299,902 bytes. Every foreground cell retains a
  transparent gutter of at least five pixels.
- The installed 0.7.4 artifact passed fresh desktop and phone captures with the
  299,902-byte atlas and no console warnings or errors. Its winter optics module
  hash matches the clean release build byte for byte.
- npm published `@austencloud/backgrounds` 0.7.4 with integrity
  `sha512-VxiGqNbqZsB/p+8LlOOe1eA/yMe1ep5lGKwjXt0qHVqsGy1H2aMByMRJ2IlQQ+PmxjwwumjBrOoOph0+lRhHmg==`.
- Pointer wakes now ease in and use a soft core instead of switching a full
  radial force across one pixel. The deterministic worst-case one-pixel force
  change fell from 1.617 to 0.070. Foreground wind tilt also uses a continuous
  undirected axis instead of an angle with a 180-degree seam.
- The clean 0.7.5 archive passed 74 tests, TypeScript build and no-emit checks,
  `publint`, and tarball inspection. npm published it with integrity
  `sha512-HnSZt8POImZKOEFBeomVQGWZ9ZXo31ZaOOtCLmca0IefVXRL9rYp2ZDW4thxyIeQ6xMd2foynzjGqfvA4sh0Gw==`.

## Research basis

- Canvas performance guidance recommends pre-rendering repeated artwork into a
  tightly sized offscreen surface and separating work by visual layer when it
  reduces repeated drawing:
  <https://web.dev/articles/canvas-performance>.
- `OffscreenCanvas` can move canvas work away from DOM synchronization and is
  broadly available, but this design needs it only as an optional cache surface:
  <https://web.dev/articles/offscreen-canvas>.
- `CanvasRenderingContext2D.filter` remains outside Baseline support, so it is
  not part of the runtime contract:
  <https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter>.

## Concurrent-work resolution

The completed Autumn handoff that introduced the shared
`DepthParallaxTracker` was preserved and incorporated. Commit `802a2e5` makes
that tracker the shared owner while keeping unrelated Autumn source out of the
Winter release archive.

## Release gate

Do not publish from a dirty shared-package checkout. After Austen approves the
visual gate:

1. isolate only the committed winter source through a clean archive;
2. run package tests, TypeScript build, publint, and focused package-entry
   checks;
3. inspect the npm tarball manifest;
4. publish the next available package version;
5. update TKA's dependency and lockfile;
6. verify the installed artifact through Chrome DevTools;
7. commit only the explicit TKA integration paths.
