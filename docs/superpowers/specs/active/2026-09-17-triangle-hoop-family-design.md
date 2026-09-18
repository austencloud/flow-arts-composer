# Triangle prop and the mini hoop upgrade

**Date:** 2026-09-17
**Status:** approved design, ready for a plan
**Branch:** `codex/triangle-hoop-family` at `E:/worktrees/tka-platform/triangle-hoop-family`

## What this is

A new prop, the triangle: three lengths of 5/8" polypro hoop tubing joined by
printed elbows into an equilateral frame with sides that still carry the
tubing's curve. It is dual-wielded like a mini hoop and it joins the hoop
family in every picker and registry the way big hoop already does.

The same change upgrades the mini hoop. Today the 2D glyph is a flat
Illustrator ring with a drawn hand and a 3.4x-fat tube, and the 3D hoop is a
bare `TorusGeometry`. After this, both hoops and the triangle come off one
station table: the 2D glyphs are generated, the 3D hoop shows its join and a
grip wrap, and the triangle exists in 2D, in both 3D renderers, and as a
captured model sprite.

Decisions made in brainstorming (2026-09-17):

| Question | Answer |
| --- | --- |
| Taxonomy | New `PropType.TRIANGLE`, variant of `MINIHOOP` like `BIGHOOP` |
| Grip | Both corner and mid-side are real; grip is an appearance toggle |
| Size | Measured off the photo: 22" side, 5/8" tube, sides bow ~4% of chord |
| Hand colour | All three tubes take the hand colour; elbows stay black; every look |
| Hoop upgrade | 3D hardware plus a regenerated glyph |
| Grip marker | Gold band at the grip, no hand glyph (matches triad, quiad, buugeng) |
| Build path | One station table, generated 2D, procedural 3D in both renderers |

## Prior decision reversed

`hoop-geometry.ts` in `@austencloud/scene-3d` records that the connector was
deliberately not modelled: "a hairline mark a couple of millimetres long... it
would either vanish or read as a defect." That was right about the seam. What
this design adds is not the seam but the two things that are actually visible
on a mini hoop in someone's hand: the tape wrapped over the join, with the
push button showing through it, and the grip wrap opposite. Those are
centimetres long, not millimetres, and they are what make a ring read as a hoop
instead of a torus primitive. The comment gets rewritten to say so.

## 1. Identity and family wiring

- `PropType.TRIANGLE = "triangle"`, display label "Triangle", button image
  `/images/props/buttons/triangle.svg`.
- Classification: `SMALL_UNILATERAL_PROPS`. Not strict-placed. Default beta
  offset (950/45).
- Family: `VARIANT_TO_BASE[TRIANGLE] = MINIHOOP`;
  `BASE_TO_VARIANTS[MINIHOOP] = [BIGHOOP, TRIANGLE]`; `VARIANT_PROP_TYPES`
  gains `TRIANGLE`. The picker keeps one Hoop tile; the family drill-down
  offers Mini Hoop, Big Hoop, Triangle.
- `SCENE_PROP_FAMILIES` gains a Hoop family (`tileLabel: "Hoop"`,
  `controlLabel: "Hoop build"`, representative `MINIHOOP`, variants Mini Hoop
  and Triangle). Big hoop stays out of the 3D studio's family control as it is
  today. `SCENE_PROP_REPRESENTATIVES` is unchanged (minihoop already
  represents); the studio's supported list gains `TRIANGLE`.
- Sequence encoder and legacy codec: `TRIANGLE` encodes as `"8"`. Every letter
  that reads as "triangle" or "tri" is taken (`T` triad, `t` bigtriad, `Q`/`q`
  triquetra, `I` quiad, `R` reserved for the removed fractalgeng); digits are
  the established fallback and 8 is the next free one.
- Loop labeler `rule-based-tagger.ts`: `TRIANGLE` tags with the hoop family.
- Arrow placements: `triangle` joins `SEEDED_PROPS` in `arrow-placer.ts` and
  `SEED_PROPS` in `scripts/seed-prop-default-placements.mjs`; its folder is
  seeded by copying minihoop's five placement files (same reach class, same
  one-handed silhouette). The two lists must stay in sync, as the comment
  there already demands.
- Day build only. No fire variant, no big variant. The finish toggle only
  appears where a prop is built twice (commit `6b27137f29`), so nothing needs
  gating.

## 2. The station table

`scripts/hoop-family-stations.json`, real millimetres, one entry per number
with a `source` string, following `scripts/fire-double-staff-stations.json`.
Both the SVG generator and the 3D builders read from this table (the worker
renderer mirrors the constants by hand, as it does for every other prop, and a
unit test pins the mirror to the JSON).

| Station | Value | Source |
| --- | --- | --- |
| tube OD | 15.875 mm | 5/8" tubing, the only size that holds an 18.5" ring (`hoop-geometry.ts`) |
| mini hoop OD | 469.9 mm | 18.5", MoodHoops' smallest 5/8" mini (`hoop-geometry.ts`) |
| big hoop | mini x `BIG_SCALE` (1.4) | existing `Hoop3D` scale |
| hoop join tape | 45 mm band, black, push button 6 mm at centre | gaffer over an insert connector, measured on a hoop in hand |
| hoop grip tape | 150 mm band, black, centred on the grip | grip wrap opposite the join |
| triangle side chord | 558.8 mm (22") | photo: tube/side ratio 0.028 at 5/8" tube |
| triangle bow sagitta | 22.35 mm (4% of chord) | photo: outward bow of each side |
| bow radius | 1757.6 mm | `c^2 / 8s + s / 2` |
| arc per side | 18.29 degrees | `2 asin(c / 2R)` |
| elbow sleeve | 1.3 x tube OD, 50 mm along each side from the vertex, sphere of sleeve radius at the vertex | photo: printed elbows |
| triangle height | 483.94 mm | `c sqrt(3) / 2` |
| corner-grip reach | 506.3 mm | height + sagitta, vertex to the far side's bow point |
| side-grip reach | 506.3 mm | height + sagitta, a side's bow point to the far vertex |

The two reaches are equal by construction. That equality is why one grip
toggle costs one box, one placement set, and one 3D reach entry instead of two
of each.

Colours: tube carries the recolor marker (blue/red per hand); elbows, join
tape, grip tape, and push button are black hardware. The pictograph's gold
grip band is `#C9AC68`, the colour triad already uses.

## 3. 2D artwork, generated

`scripts/build-hoop-family-svgs.mjs` reads the station table and writes:

| Output | Content |
| --- | --- |
| `static/images/props/pictograph/minihoop.svg` | ring, join tape at the far rim, gold band at the near rim |
| `static/images/props/pictograph/bighoop.svg` | the same drawing scaled to its existing box |
| `static/images/props/pictograph/triangle.svg` | corner grip: gripped elbow drawn gold, far side outward |
| `static/images/props/appearances/triangle-side.svg` | side grip: gold band at the near side's bow point, far vertex outward |
| `buttons/` and `animated/` copies | same drawings, as the other props ship them |
| `src/lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.ts` | box sizes and tip points for the three props and the side grip, plus the 3D reaches in metres |

Rules the generator follows:

- **Notation weight, not real weight.** The glyph tube is 10 box units,
  roughly 2x the real tube at the hoop's scale (the old glyph used 16, 3.4x).
  Legibility at cell size is the point of a glyph; the true weight lives in the
  model look. Hardware bands are drawn at 1.3x the glyph tube, matching the 3D
  sleeve ratio.
- **Hoop boxes do not move.** Minihoop stays `257.9 x 138.2`, bighoop stays
  `600 x 300`, so trails, mandala reach, and existing sprites keep their frame.
  The ring is fitted to the box: near-rim tube centreline at the box centre,
  far outer edge on the box edge. For the mini hoop that is a centreline
  diameter of 123.95 units (old drawing: 120.5).
- **The triangle box is derived.** Scale is the mini hoop's units per
  millimetre (123.95 / 454.025). Half-width = reach x scale + half glyph
  tube; height = far-vertex spread + elbow sleeve. Expected about
  `286 x 166`; the generated file is the source of truth and
  `PROP_DIMENSIONS` in `IPropTextureLoader.ts` imports it rather than
  restating it.
- **Tip points.** Five per look, mirroring the hoop's five: corner grip gets
  the far side's bow point, both far vertices, and the bow points of the two
  gripped sides; side grip gets the far vertex, both near vertices, and the
  bow points of the two far sides. `prop-tip-points.ts` imports them.
- The generator is idempotent and checked in with its outputs; a test asserts
  each written SVG's `viewBox` equals the generated box, and that minihoop and
  bighoop boxes equal their pre-change values.

## 4. 3D, both renderers

Main thread (`@austencloud/scene-3d`, edited through the pnpm patch as the
baton and fire staff were):

- `hoop-geometry.ts` gains the join and grip tape stations and the rewritten
  provenance note. `Hoop3D.svelte` adds two short `TorusGeometry` arcs at 1.3x
  tube radius over the ring (join tape at the far rim with a small sphere for
  the button; grip tape centred on the grip) in the black hardware material
  from `frame-materials.ts`. Scale still applies for big hoop.
- New `triangle-geometry.ts` (stations in metres, bow radius, arc angle,
  vertex positions, grip offsets) and `Triangle3D.svelte`: three
  `TorusGeometry` arcs at the bow radius, each rotated 120 degrees about the
  centroid; six elbow legs as torus arcs at sleeve radius over the first 50 mm
  of each side; three spheres at the vertices. Tube in the hand colour via the
  existing hoop materials; hardware black. The group origin is the grip:
  corner grip puts a vertex at the origin with the far side along +reach; side
  grip puts a side's bow point at the origin with the far vertex along
  +reach. `Prop3D.svelte` dispatches `TRIANGLE` with `build.triangleGrip`.
- `PropType` in the package gains `TRIANGLE`; `prop-model-registry.ts` is
  untouched (no GLB).

Worker renderer (`worker-procedural-props.ts`): `createHoop` gains the same
two bands and button; new `createTriangle` mirrors `Triangle3D` from the same
numbers; `PROCEDURAL_WORKER_PROP_TYPES` and `CANONICAL_PROP_TYPE` gain
`TRIANGLE`; `WorkerPropBuild` gains `triangleGrip`.

Reach (`prop-tip-geometry-3d.ts`): `TRIANGLE` is an absolute 0.5063 m, like
the baton. The hoop entries become absolute too, 0.454 m for mini (tube
centreline to tube centreline across the ring) and 1.4x that for big; a hoop
is a fixed-size object and the current `0.7 x staffLength` only lands on the
rim at the default staff length. Emitters and trails follow the same table.

## 5. Grip toggle

- Type: `TriangleGrip = "corner" | "side"`, default `"corner"`, owned by a new
  `triangle-appearance.ts` beside `fan-appearance.ts` with `TRIANGLE_GRIPS`,
  `normalizeTriangleGrip`, and the artwork path for the side look.
- 2D: `PropRenderAppearance` gains `triangleGrip`. `resolvePropRenderKey`
  returns `triangle__side` for the side grip (`triangle` for corner), and the
  texture loader maps that key to `appearances/triangle-side.svg`, exactly the
  path `fan__flat-grip` takes today. Tip points resolve by render key so the
  side grip gets its own five.
- 3D: `PropBuild` (package) and `WorkerPropBuild` gain `triangleGrip`; the
  build flows through the same override path `fanBuild` uses. No emitter
  change, since reach is grip-independent.
- Settings: `triangleGrip` persists next to `fanAppearance`. The prop tab
  shows a two-pill Grip row (Corner / Side) when the triangle is the selected
  prop, in the slot `FanStyleOptions` occupies for fans, using the shared chip
  primitive. Toggles or pills only; no checkboxes.
- Global appearance, not per-beat notation. Choreography and URLs never carry
  the grip.

## 6. Sprites, tests, verification

- `/test/prop-3d-studio/sprites` captures `minihoop`, `bighoop`, `triangle`,
  and a `triangle-side` pair (captured with `build.triangleGrip = "side"`),
  writing `PROP_MODEL_SPRITES` entries for all four keys and the sprite files
  `appearances/model/triangle-side-{blue,red}.svg`. With the model look
  active, `resolvePropRenderKey` returns `triangle__model` for the corner
  grip and `triangle-side__model` for the side grip; `hasModelSprite` and
  `parseModelRenderKey` treat `triangle-side` as a sprite key whose notation
  prop is `triangle`.
- Unit tests: station math (bow radius, arc angle, corner and side reach equal
  to the millimetre), generated boxes and tip points, registry membership
  (classification, variants, families, encoder round-trip, seeded lists in
  sync), render-key resolution for both grips, worker builder part counts for
  hoop and triangle, and the 3D reach table.
- Visual pass, per `visual-verification-mandatory.md`: 3D studio with
  triangle in both grips and both renderers, mini hoop before/after; a
  pictograph cell with triangle on each hand in both looks; the picker tile
  and drill-down; the Grip row across the seven viewport tiers, since it is
  a new element on the settings surface.

## 7. Capability ownership (never-hand-roll record)

- Searched: hoop, torus, triangle, tri-hoop, grip, appearance, build,
  sprite, station, elbow.
- Closest matches: `Hoop3D` / `hoop-geometry.ts` (extend), `Triad3D` /
  `triad-frame.ts` (pattern for a multi-part frame prop, not extended),
  `fan-appearance.ts` and `resolvePropRenderKey` (extend for the grip),
  `worker-procedural-props.ts` (extend), `fire-double-staff-stations.json`
  and its build script (pattern for the station table and generator),
  `/test/prop-3d-studio/sprites` (extend for the side-grip capture).
- Decision: extend existing owners for hoop geometry, appearance, render
  keys, worker props, and sprites; create `triangle-geometry.ts`,
  `Triangle3D.svelte`, `triangle-appearance.ts`, and the generator as new
  owners with the station table as their single source.

## Out of scope

- Fire triangle or fire hoop builds.
- A big triangle.
- Per-beat grip changes in notation.
- Redrawing any other prop's glyph.
- Replacing the pnpm patch workflow for `@austencloud/scene-3d`.
