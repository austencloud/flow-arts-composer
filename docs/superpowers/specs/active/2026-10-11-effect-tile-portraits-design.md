---
status: active
value: 4
effort: L
work_state: ready
remaining: "Extract the tile paint kit from Fire/Coal/Bloom, then port the eleven approved prototype portraits (Zap, Sparkle, Ghost, Goo, Bubbles, Petals, Smoke, Ink, Silk, Animal, Pulse) into Svelte tiles, wire the dispatcher, add look copy, and review every tile in the picker at 304x114."
depends_on: ""
plan_path: ""
tags: [effects, create, ui]
last_triaged: "2026-10-11"
---

# Effect Tile Portraits

**Status 2026-10-11.** Design approved by Austen tile by tile in the browser.
Nothing is implemented. The approved prototype pages live in
[`2026-10-11-effect-tile-portraits/reference/`](2026-10-11-effect-tile-portraits/reference/README.md)
and are the reference for every port below.

## Goal

The effect picker on the Create player (the quick-switch popover and the
Effects panel catalog) shows one portrait per effect preset. Five effects have
purpose-built canvas portraits (Trails, Fire, LED, Coal, Bloom). The other
eleven fall back to a generic SVG card that reads as a label, not a look. This
work brings those eleven up to Fire and Bloom quality:

Zap, Sparkle, Ghost, Goo, Bubbles, Petals, Smoke, Ink, Silk, Animal, Pulse.

Out of scope: the five existing portraits (unchanged), Frost (retired from the
strip, keeps its fallback), the effects themselves, and the picker layout.

## Tile contract

Every portrait follows the rules the existing five established:

- A 720x270 canvas, shown at about 304x114 in the picker. Everything must read
  at that size: strokes, sparks and rims get tile-size boosts, listed per
  effect below, and nothing hinges on a one-pixel detail.
- Dark ground, additive light where the effect is light. Dark materials
  (Cursed smoke, Shadow silk and animal) sit on a lit ground, a mid-grey
  gradient plus a soft light blob, so they read as silhouettes.
- One staged moment, not a replay. A literal replay was tried for Bloom and
  lost: at tile size a real render is mostly empty frame. Each tile composes
  the look from a staged prop gesture (a sweep, a spiral, a coil) and freezes
  the instant that shows the preset best.
- Every mark comes from the preset's own parameters merged over
  `DEFAULT_EFFECTS_CONFIG`. Nothing is keyed on a preset id. Two presets that
  differ only in a palette differ only in color.
- Seeded random only (the shared `lcg`), never `Math.random`, so a tile is
  stable across re-renders and screenshots.
- Where the renderer owns the geometry (silk ribbon, animal body, pulse ring,
  petal silhouettes, smoke curl), the tile calls the renderer's own helpers
  rather than redrawing an approximation. The LED tile is the only one that
  runs the real renderer wholesale; the others port the drawing routines.

## Architecture

### Shared tile paint kit

Fire, Coal and Bloom each carry private copies of the same helpers. Extract
them into one module:

`src/lib/shared/animation-engine/components/effects-panel/thumbnails/tile-paint.ts`

exporting:

- `TILE_W = 720`, `TILE_H = 270`
- `lcg(seed)`: the 32-bit linear congruential generator
- `hexToRgb(hex)` returning `[r, g, b]` in 0..1, `css(rgb, alpha)`,
  `mix(a, b, t)`, `WHITE`
- `ground(ctx, tint)`: the vertical dark gradient (tint × 1.6 at the top,
  × 0.5 at the bottom); the lit-ground variant is the same call with a light
  tint plus a `blob`
- `blob(ctx, x, y, rx, ry, color, alpha)`: the soft elliptical radial gradient
  every tile is built from (stops 1.0 / 0.42 / 0)
- `glowStroke(ctx, points, width, color, glow, alpha, core?)`: wide colored
  halo under a hot core (the Zap bolt contract)
- `terminal(ctx, x, y, r, color, alpha)`: radiant tip, white heart and colored
  skirt
- `smoothstep`, `easeOutCubic`, `clamp01`

The prototype [`kit.js`](2026-10-11-effect-tile-portraits/reference/kit.js)
is the reference. Fire, Coal and Bloom switch to the kit for the helpers they
duplicate (`lcg`/`mulberry32`, `hexToRgb`, `css`, `mix`, `blob`) with no
visual change; their drawing code stays where it is. Keep the kit free of
Svelte and DOM so it is unit-testable.

### One tile component per effect

Each effect gets `thumbnails/<Effect>Thumbnail.svelte` with the same shape as
`FireThumbnail.svelte`: props `preset` (typed `EffectPreset<"effect">`) and
`active`, a `$effect` that merges the patch over the defaults and paints once
into a bound canvas, the same wrapper markup and `.active` accent border. Art
direction and parameter mapping live in a sibling `<effect>-tile.ts` so the
drawing is plain TypeScript, importable by tests and by the prototype pages
if someone wants to re-check a look.

Target size per tile is about 100 to 200 lines of art direction on top of the
kit and the renderer helpers it borrows.

### Dispatcher

`EffectPresetThumbnail.svelte` gains one branch per effect type (`zap`,
`sparkles`, `ghost`, `goo`, `bubbles`, `petals`, `smoke`, `ink`, `silk`,
`animal`, `pulse`). The `EffectLookPreview` fallback stays for anything else
(Frost). The explanatory comment above the fallback is updated to say the
remaining effects are Frost only.

### Prop input for Ghost and Silk

Two tiles depend on the user's current prop:

- Ghost blits the real prop sprite (whatever prop is selected) in its last
  poses. Without it the tile would show a staff for a poi user.
- Silk's satin palette takes most of its color from the prop, so Classic shows
  the hand's own blue.

`EffectPresetThumbnail` gains an optional `propType?: string | null` prop and
passes it to Ghost and Silk. The three call sites thread it:
`EffectPresetsSection.svelte` and `EffectsPanel.svelte` already have
`animationSettingsState.currentPropType` in scope, and `EffectQuickSwitch.svelte`
reads the same state. Other tiles ignore it. A `null` prop falls back to the
default staff so the catalog still renders on a page with no animator.

Ghost obtains its colored sprite through the existing prop image path
(`Canvas2DImageLoader` / the SVG image cache in
`src/lib/shared/animation-engine/services/canvas2d/`), the same source the
engine draws from, and renders the poses with the ghost renderer's own
treatment layers (glassy body, frost veil, pale rim). Export those layer
builders from `ghost-2d-renderer.ts` rather than copying them. The sprite
load is async, so the Ghost tile paints its ground immediately and the poses
when the image resolves; a cache miss must not throw.

### Caching

Tiles paint once per preset and prop, like Fire does. The quick-switch
popover mounts every effect's catalog portrait at once, so each tile's paint
must stay well under a frame at 720x270. The heavier tiles (Goo's metaball
pass, Smoke's column, Animal's clipped redraw, Pulse's simulation) measure
their first paint during implementation; anything over about 8 ms moves its
expensive stage into a module-level `Map` keyed by preset id plus prop type so
re-mounting the popover reuses the result.

### Look copy

`thumbnails/look-copy.ts` gets one line per new preset, describing the
visible result and never the parameter values, matching the existing voice
("Sharp diffraction flare", "Few embers, short fall"). Preset ids:

- Zap: `zap-storm`, `zap-tesla`, `zap-web`
- Sparkle: `sparkles-fairy-dust`, `sparkles-confetti`, `sparkles-prism`,
  `sparkles-starfall`, `sparkles-glitter`, `sparkles-aurora`
- Goo: `goo-classic`, `goo-fountain`, `goo-whip`, `goo-mercury`, `goo-acid`,
  `goo-blood`, `goo-spirit`
- Bubbles: `bubbles-classic`, `bubbles-fizz`, `bubbles-dream`,
  `bubbles-iridescent`, `bubbles-acid`, `bubbles-spirit`
- Petals: `petals-classic`, `petals-storm`, `petals-jungle`, `petals-ember`,
  `petals-gilded`, `petals-tornado`
- Smoke: `smoke-classic`, `smoke-fog-wall`, `smoke-genie-burst`,
  `smoke-cursed`, `smoke-spirit-veil`, `smoke-campfire`
- Ink: `ink-toxic`, `ink-neon-tag`, `ink-splatter`
- Silk: `silk-classic`, `silk-streamer`, `silk-whip`, `silk-royal`,
  `silk-inferno`, `silk-phantom`
- Animal: `animal-wisp`, `animal-whisper`, `animal-serpent`,
  `animal-ember-drake`, `animal-gilt-wyrm`, `animal-inchworm`
- Pulse: `pulse-sonar`, `pulse-shockwave`, `pulse-heartbeat`, `pulse-ripple`

Ghost has no named presets (its group is empty by design); its catalog
portrait reads the default ghost intent and needs no copy line.

## Art direction per effect

Each entry names the staged moment, how parameters become marks, which
renderer modules the tile borrows, and the tile-only boosts. The prototype
page holds the exact constants.

### Zap (`zap.html`)

Bolts between the two prop tips. `style` picks the silhouette, `jitter`
roughens the path, `branching` adds forks, `frequency` adds fainter ghost
strikes, `glow` widens the halo, `intensity` sets brightness. Drawn with the
kit's `glowStroke` and `terminal`. Storm was punched up at review: more forks
and ghost strikes than its first pass.

### Sparkle (`sparkle.html`)

A tip has just swept an arc left to right; the glints are what it left
behind. `rate` sets how many, `size` the arm length, `gravity` pulls the
older ones down, `lifetime` stretches the tail, `spread` scatters them, and
the mode decides whether they stream out, cling to the path, or pop in
clumps. Color follows the preset: solid, a palette, or the rainbow hue drift.

### Ghost (`ghost2.html`)

The user's current prop sprite at its last poses along a short sweep, each
pose treated by the renderer's own age curve: glassy body, then frost veil,
then pale rim, then gone. `decay` sets how many poses survive and `interval`
how close they sit. The prototype used a fixed staff SVG with a blue hand
fill; the tile uses the live sprite (see Prop input above).

### Goo (`goo.html`)

A rope of liquid laid along the tip's last sweep, merged with the renderer's
own metaball recipe (blur, then contrast), so it gets a real gooey edge, a
rim band in the palette's edge color, wet specular glints, and drips hanging
off the body. `motionEmission` sets rope thickness, `ambientEmission` how
much it oozes and drips at rest, `surfaceTension` how long a drip necks,
`viscosity` how slowly it falls, `clarity` how dark the interior stays,
`intensity` the glow. Seven looks.

### Bubbles (`bubbles.html`)

A field of bubbles rising off the tip's last sweep. Each is the renderer's
bubble: a clear film brightening toward the edge, a hairline rim, a thin-film
sheen on the shadowed side, a specular up-left and a soft bounce down-right.
Sizes follow the renderer's power law (mostly small, a few big), the big ones
have risen furthest, and a couple have just popped into film slivers.
`intensity` sets size, size jitter adds the big ones, buoyancy lifts the
field, emission sets the count. Oil rims shift magenta, cyan, gold with age.

### Petals (`petals.html`)

The app's own leaf silhouettes, drawn by the module the renderer calls
(`src/lib/shared/effects/domain/petal-palettes.ts`: maple, oak and ginkgo for
autumn and gold, monstera and banana for jungle, blossoms and loose petals
for classic, charred flakes with ember rims for ash). They lie along the
tip's last sweep under the renderer's airstream rule from `petal-airflow.ts`:
each leaf launched with carry of the tip's speed, that motion bleeding off at
the streak rate, then easing into its fall. `intensity` sets size, emission
sets how many, and the face flutter turns some edge-on.

### Smoke (`smoke3.html`, the v6 plume)

A staged plume. The tip rests low in the frame after a short sweep in from
the left; a column rises from it. The column's spine is bent by the
renderer's own curl field (`src/lib/shared/3d/effects/smoke/smoke-curl-field.ts`,
`curl2D`), its height is rise speed times the palette's lifetime (fog stays a
low blanket, genie shoots up), puffs grow and thin as they climb (the
renderer's 2.4x growth and hold-then-fade curve), `intensity` sets puff size
and density, `ambientEmission` feeds the column and `motionEmission` feeds the
fainter trail along the sweep. Dark palettes (Cursed) use the lit ground.
Earlier passes (v4, a replayed sweep) were rejected as awkward; v6 is the
approved staging.

### Ink (`ink.html`, v2)

One calligraphic swash: a loop through the middle of the frame, exiting
right. The ribbon is built the renderer's way: width from tip speed (lifts
when fast, presses when slow), the broad nib held to the stage center, extra
load in the turn, a 1.42x cap on width change, the tail collapsing to a
point. Dense ink gets the four-pass pigment body with wet gloss behind the
brush, pigment grain stamped source-atop, and dry-bristle cuts; neon draws
additively. Splatter bursts fly off the sharp turns, and Toxic's viscosity
lets the oldest ink shatter into droplets. Port the ribbon, stamp, bristle
and droplet routines from `ink-2d-renderer.ts`, exporting them if they are
private. Tile boost: geometry scale 2.6.

### Silk (`silk.html`, `silk-draw.js`)

One ribbon of cloth attached to the tip at the head (upper right), trailing
back through a spiral gesture (chosen over the S-sweep and figure variants at
review). `duration` sets how far back the tail reaches: 60% of the gesture at
the shortest, all of it at the longest. Drawn with the renderer's own
routines from `silk-2d-renderer.ts` and `ribbon-trace.ts`
(`resolveSilk2DWidthEnvelope`, `smoothSilk2DPath`,
`resolveSilk2DMaterialColors`, `resolveSilk2DMaximumLength`,
`resolveSilk2DSampleSpacing`, `traceForward`, `traceBackward` and the
centripetal variants): samples every 4 px of path, width envelope opening
from the free tail and gathering into the prop, `tautness` narrowing where
the tip moved fast, `flutter` displacing the free end with the two sine waves
and billowing the hem, gravity sag, the fold wave, and the material profile
(body, blurred shadow band, sheen band, two selvedges; ember adds an aura).
Satin takes most of its color from the prop. Tile boosts: geometry scale 2,
shadow band × 1.6, sheen × 1.5, left selvedge × 1.5; Shadow palette uses the
lit ground.

### Animal (`animal.html`, `animal-draw.js`)

The creature's head is the prop tip and its body is the figure the tip just
drew: a lead-in from the upper right into a coil, the tail leaving left.
Short creatures make a hook, medium ones a C, the longest close the loop so
the neck passes over the coil; that crossing patch is redrawn in depth order
inside a clipped disc. The renderer's build is ported as is from
`animal-2d-renderer.ts`: fixed body length (`bodyLength`), snout-to-tail width
profile per creature, the slither wave ramped from zero at the head to full
at the tail and frozen mid-wag, contact shadow, cylinder shading, scale
chevrons, the sheen down the lit edge, and each creature's ornaments (snake
tongue mid-flick, dragon crest, horns and lagging whiskers replayed along the
path, caterpillar legs, bands and antennae). Ethereal grades body to bodyAlt
head to tail; ember adds the aura and composites additively. Export the body
profile, path resampling and layer painters from the renderer so the tile
and the stage share one implementation. Tile boosts: width scale 2.8, length
× 1.35, intensity floor 0.62, wave amplitude at half the width boost,
fit-to-frame zoom capped at 1.45; Shadow palette uses the lit ground. The
first S-sweep staging was rejected ("tighter figure, more coil").

### Pulse (`pulse.html`, `pulse-draw.js`)

A staff turning half a turn per beat sweeps in from the lower left; both ends
ring, as the default both-ends tracking does. The renderer's ring state
machine (`pulse-2d-renderer.ts` with `pulse-rhythm.ts`) is run over that
motion and frozen shortly after the newest primary ring, so each look shows
the moment its trigger makes: Sonar and Heartbeat ring on the beat with the
charge gathering at the tips for the next one, Shockwave fires at a swing
peak and throws its ring forward with the carry, flash, glint, lead arcs and
chromatic fringe, and Ripple streams small rings behind each tip between its
beat rings, each with its overtones. Radii, bands, flash and drift are the
renderer's formulas (`reach`, `lifetime`, `thickness`, `asymmetry`,
`chromatic`, `harmonics`, `velocityScale`, `charge`). Export `drawRing`,
`drawFlash` and `drawCharge` (or a ring painter that takes a ring record)
from the renderer. Tile-only: rings live 2.2x longer so two beats of history
stay on the frame, a fatter line unit (2.4x) for strokes and bands, intensity
floor 0.55, freeze offset per trigger (beat 0.72 s, velocity 0.2 s,
continuous 0.32 s), a faint staff bar between the two ring sources.

## Reuse and exports

The tiles must not fork renderer geometry. Where a helper is private today,
export it; where a drawing routine is bound to a renderer instance, lift it
into a pure function the renderer calls too. Expected export work:

| Module                                    | Needed by | Export                                                                      |
| ----------------------------------------- | --------- | --------------------------------------------------------------------------- |
| `ghost-2d-renderer.ts`                    | Ghost     | treatment layer builders (frost, rim) and the age curve                     |
| `petal-palettes.ts`, `petal-airflow.ts`   | Petals    | already exported                                                            |
| `smoke-curl-field.ts`                     | Smoke     | `curl2D`, already exported                                                  |
| `ink-2d-renderer.ts`                      | Ink       | ribbon build, pigment stamp, bristle cut, droplet                           |
| `silk-2d-renderer.ts`, `ribbon-trace.ts`  | Silk      | already exported (see `silk-entry.ts`)                                      |
| `animal-2d-renderer.ts`                   | Animal    | body width profile, `resampleAlongPath`, layer painters, head and ornaments |
| `pulse-2d-renderer.ts`, `pulse-rhythm.ts` | Pulse     | ring painter, flash, charge; rhythm helpers already exported                |

Renderer exports are additive; no renderer behavior changes. The renderer
test files next to each module guard that.

## Verification

- Unit: a test per tile module asserting it paints without throwing for every
  preset in its group (plus the default intent for Ghost) on an offscreen
  canvas, and that two paints with the same inputs produce identical pixels
  (seeded random). `preset-data.test.ts` stays the shape guard.
- Dispatcher: a Svelte component test that every preset group's effect type
  resolves to a dedicated tile, and Frost still gets the fallback.
- Visual: every new tile reviewed in the real picker at 304x114 in both the
  quick-switch popover and the Effects panel catalog, dark and light theme,
  against its prototype page. The review is a side-by-side screenshot set
  saved under `2026-10-11-effect-tile-portraits/evidence/`. Fire, Coal and
  Bloom screenshots before and after the kit extraction must match.
- Paint cost: first-paint time per tile logged once during review; anything
  over about 8 ms gets the cache described above.

## Implementation routing

Four batches, each a scoped commit set in one worktree under
`E:/worktrees/tka-platform/`, branch `codex/<slug>`, finished with
`npm run wt:finish -- codex/<slug> --route /create`:

1. Kit extraction plus Zap, Sparkle, Ghost (prop threading lands here).
2. Goo, Bubbles, Petals, Smoke.
3. Ink, Silk, Animal (renderer exports).
4. Pulse, look copy, dispatcher comment, evidence set.

Implementation runs on `sonnet` per the model routing contract, inline or as
one agent per batch; one `opus` review at the end against this spec and the
prototype pages, not per batch. The planner (this session) and Austen review
the evidence set before the fourth batch merges.

## Decisions recorded

- Bring the eleven generic tiles up to Fire/Bloom quality; keep the five
  purpose-built tiles as they are.
- Shared paint kit plus one canvas portrait per effect, over a single generic
  portrait engine or per-effect live renders.
- Prototype in a browser page, react to the picture, then port. Every page in
  the prototypes folder was locked by Austen in that loop.
- Ghost reflects the user's current prop, not a fixed staff.
- Silk: spiral gesture. Animal: coil staging. Smoke: staged plume (v6), not a
  replayed sweep. Pulse: both staff ends ring, two beats of history.
