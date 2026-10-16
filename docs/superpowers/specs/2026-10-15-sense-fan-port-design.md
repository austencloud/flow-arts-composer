# Flow DNA Sense Fan as a fan look

Date: 2026-10-15. Status: design, awaiting Austen's approval.

## Why

Duncan Greenwood of Flow DNA asked for the props he built in Flow DNA Studio
to come into the Composer's prop system, credited to Flow DNA. This spec
lists every prop his app draws, says how each one maps in, and fixes the
credit line. Implementation follows in a separate plan.

## Census: what Flow DNA Studio draws

Flow DNA Studio draws exactly one prop.

| Prop | How his app draws it | Shape | Motion rules | Mapping |
| --- | --- | --- | --- | --- |
| Sense Fan (Flow DNA's LED fan) | A flat outline of the fan's shell, projected from his 3D model: one silhouette with about two dozen lattice holes, filled even-odd, plus stroked hub and hinge edges. Lit mode places each LED from the firmware's pixel map. | Ring grip near the base and a wide arched lattice leaf. About 336 mm from base to arch and 468 mm across; about 272 mm from grip centre to arch tip, so it is wider than it is long. | Held at the grip, like every Composer fan. Lengths in prop lengths, grip to tip. Wall plane only. | **New fan look** ("Sense Fan") |

Other Flow DNA props, for completeness:

- **Flowgeng.** Not drawn in his app. Already in the Composer as the buugeng
  family's Version 2, credited "Flow DNA" (`prop-look.ts`,
  `MODEL_LOOK_CREDITS`). No change.
- **Poi, staff and buugeng mocks.** Parked in his app and never built.
  Nothing to port.
- **Fan folds and depth.** A research item in his app, not a prop. Out of
  scope.

## Decisions (Austen, 2026-10-15)

1. The Sense Fan becomes a **fan build**, a new entry in `FAN_BUILDS`, not a
   new `PropType`. Fan motion, orientation and placement rules already match
   his: fans are held at the grip.
2. The outline is **traced from Flow DNA Studio's own outline** of the fan,
   with Austen's yes. tka-platform is public, so the traced outline is
   published. The `flowdna-guard` hook asks Austen again at the step that
   writes it; that prompt is expected and is answered by Austen, not worked
   around.
3. First port: **2D art plus an unlit 3D shell.** No LED lighting. The LED
   positions live in Duncan's firmware, which is never copied. A lit build
   waits for an LED layout Duncan chooses to publish.
4. Credit: **"Flow DNA"**, link left for Duncan to supply.

## Design

### Reference file

`scripts/assets/sense-fan-reference.json` is the single source for every
Sense Fan asset, following `flat-grip-fire-reference.json`. It holds:

- the silhouette ring and the lattice hole rings, in metres, in a frame with
  the grip centre at the origin and the arch along +x;
- the grip centre and the prop length (grip centre to arch tip);
- a shell thickness, marked as an estimate (3 mm) until Duncan gives the
  real figure;
- `source` and `provenance`: outline from Flow DNA's Sense Fan model, shared
  at Duncan Greenwood's request, conversion approved by Austen on
  2026-10-15; the LED layout is deliberately absent.

The conversion keeps the silhouette and the lattice holes. It drops the
stroked hub and hinge edges, and holes too small to read at pictograph size
(the screw holes and degenerate slivers), using one minimum-area threshold
written in the conversion script. The conversion runs once; the source
location in Flow DNA Studio is not recorded in this public repo.

### 2D look

- `static/images/props/appearances/fan-sense.svg`, with its mirror in
  `mcp-server-pkg/assets/images/props/appearances/`, generated from the
  reference file by the build script.
- Shared fan viewBox (260 x 207), grip at the shared centre (130, 103.5),
  leaf pointing the same way as the other builds. The span is the limiting
  dimension; size relative to the other builds follows real millimetres, the
  way Star and Flat Grip are sized (`imageScale`).
- The shell fills in the hand colour, holes show through, and the
  light-paper contrast treatment applies as it does to the other builds.
- Ribs thin enough to vanish at pictograph size are checked in the browser;
  the fix, if needed, is raising the hole threshold, not redrawing by hand.

### 3D shell

- `scripts/build-sense-fan.py` reuses `build-fan-model.py`'s cut-sheet
  extrusion (the DoodleGrip Day method) to extrude the outline with its
  holes at the reference thickness, writing `static/models/props/fan-sense.glb`.
- One material, no LEDs. Frame colour and cover choices do not apply, as
  with Moon LED, Flat Grip and Star: one render key, `fan__sense` (and
  `bigfan__sense`). `resolveFanRenderKey` falls through to Lotus for an
  unknown build, so the new key must be added explicitly and tested.
- Tip anchors at the arch's outer tips feed trails and effects
  (`prop-build-tip-geometry-3d.ts`, `prop-tip-points.ts`); the 2D/3D tip
  parity test covers the new build.
- With an LED effect on, it behaves as an ordinary unlit fan.

### Picker and credit

- "Sense Fan" joins `fanBuildPreviewOptions` and `COMPACT_FAN_LOOKS`, after
  Moon LED, with a preview image from `scripts/build-sense-fan-preview.mjs`
  (the Flat Grip preview pattern).
- `designCredit.originator` is "Flow DNA". `sourceUrl` becomes optional on
  `PropBuildPreviewOption.designCredit` and `PropDesignCredit`; the Sense Fan
  has none until Duncan names a product page, then it is filled in. Anything
  that renders a credit link renders plain text when the URL is absent.
- The MCP server's fan build lists (`preference-tools.ts` and the renderers
  that enumerate builds) gain `sense`.
- The pictograph package in progress on `codex/pictograph-package` draws
  props from this system, so it picks up the Sense Fan without its own work.

## Checks

- Focused tests: `fan-appearance` (build listed, compact look, credit with
  no URL, render key `fan__sense`, normalisation keeps it),
  `prop-svg-loader.fan-build` (loads `fan-sense.svg` in the hand colour,
  viewBox and centre), the 2D/3D tip parity test, `painted-bounds`, and a test that the
  static and MCP copies of `fan-sense.svg` match (as
  `tests/unit/club-prop-appearance.test.ts` does for clubs).
- Browser check of a pictograph, the 2D animator and
  `/test/prop-3d-studio/capture?prop=fan&fanBuild=sense`, in light and dark.
- Full check on d2, never GitHub Actions.

## Out of scope

- LED lighting for the Sense Fan, until Duncan publishes an LED layout.
- Fan folds and off-wall-plane motion.
- Any change to the buugeng Version 2 credit beyond making its URL optional
  in the type.

## Open with Duncan

Austen approves any message before it goes to Duncan.

- The shell's real thickness.
- A product page or Instagram link for the credit.
- Whether he later wants to publish an LED layout for a lit build.
