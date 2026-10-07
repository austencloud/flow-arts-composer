---
status: active
value: null
effort: null
remaining: "Verify Ink Preset Curation and Material Redesign against the current Ink Preset Curation and Material Redesign runtime and acceptance criteria before resuming implementation. Prior recorded remainder: Verify revised Sumi stroke and preset curation against the final art-direction criteria and current renderer."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Ink Preset Curation and Material Redesign

**Status:** Approved by direct implementation request on 2026-08-14

## Outcome

The production Ink surface contains four deliberate looks: a long cool-blue
liquid Default, Toxic, Neon Tag, and Splatter. Classic and Drip are removed from
the preset cards because literal black pigment is not legible on the production
stage. Watercolor remains available in advanced customization but is removed
from the named surface after it stayed compositionally awkward over the mandala.
Sumi also remains available in advanced customization but is retired as Default
after two rejected production passes.

Toxic and Neon Tag remain the visual anchors. Splatter keeps the impact concept
but trades saturated red ovals for controlled oxblood chips and a cohesive wet
stroke.

## Audit

The default Sumi Flow material scored **2.8 / 10** in the production Effect
Tuner at 1920 x 1080 after an eight-second warm-up.

| Criterion             |  Score | Evidence                                                                                                                      |
| --------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------- |
| Immediate read        | 2 / 10 | The frame reads as wide gray hoses before it reads as ink.                                                                    |
| Choreography fidelity | 1 / 10 | Attached points receive 180 px/s² gravity and drift far below the recorded path.                                              |
| Material credibility  | 3 / 10 | Four centered ribbon passes create concentric bands. The highlight is centered, so it reads as glow instead of a wet surface. |
| Motion response       | 5 / 10 | Width and emission react to speed, but the broad outer passes bury the pressure change.                                       |
| Composition           | 2 / 10 | A 420 px reference stroke becomes roughly 660 px at the observed production scale and clips against the stage.                |
| Technical foundation  | 7 / 10 | LOOP boundaries, path-length trimming, and splatter bounds already have focused tests.                                        |

The strong foundation is why this is an extension of `Ink2DRenderer`, not a
replacement.

## Research Basis

[Dripping Thin Films for Real-time Digital Painting](https://research.adobe.com/publication/dripping-thin-films-for-real-time-digital-painting/)
separates attached pigment transport from detached drips. That distinction
informs the physics split here: the default Sumi mark stays on the brush path
while its droplets retain gravity. The paper uses a grid-based thin-film model;
it does not validate this renderer's ribbon geometry.

[Stable Fluids](https://graphics.stanford.edu/courses/cs448-01-spring/papers/stam.pdf)
and [Visual Simulation of Smoke](https://www.graphics.stanford.edu/papers/smoke/)
support advected fluid fields for gas. Ink is a surface mark, so a volumetric
solver would solve the wrong material problem. The existing variable-width
ribbon remains the repository's canonical Ink behavior owner and is the scope
of this redesign.

[Industrial-Strength Painting with a Virtual Bristle Brush](https://research.adobe.com/publication/industrial-strength-painting-with-a-virtual-bristle-brush/),
[A Brush Stroke Synthesis Toolbox](https://research.adobe.com/publication/a-brush-stroke-synthesis-toolbox/),
and [RealBrush](https://research.adobe.com/publication/realbrush-painting-with-examples-of-physical-media/)
support the material target: a swept stroke needs pressure-varying geometry and
strand-level surface variation. The implementation keeps the existing bounded
2D owner and uses deterministic curved segments, cross-stroke loading, and
fiber passes instead of introducing a second simulation.

## Capability Ownership

**Extending `Ink2DRenderer` with a Sumi material profile.**

- `resolveInk2D` owns backend-specific stroke physics.
- `Ink2DRenderer` owns path capture, ribbon geometry, pigment drawing, bristle
  breakup, and droplets.
- No new renderer, effect intent, control, preset, or storage migration is
  introduced.

## Implementation Plan

1. Give Sumi a production profile in `resolveInk2D`:
   - a 10-42 px pressure range with a sharper loaded-brush response;
   - 340 px retained path instead of 420 px;
   - 2.15 second mark lifetime instead of 3 seconds;
   - zero gravity on the attached mark;
   - unchanged droplet gravity.
2. Add a Sumi material branch in `Ink2DRenderer`:
   - one matte blue-charcoal body;
   - one offset carbon-loaded side;
   - locally varied pigment density;
   - one narrow, broken dry-side catch;
   - edge fibers, turn pools, and tapered live lifts.
3. Replace the shared four-band dense material with bounded material profiles:
   - Watercolor keeps its two-pass wash;
   - Neon uses a narrow additive tag with a broken hot core;
   - dense inks use one wet margin, one pigment body, local pigment loading,
     and a one-sided reflection;
   - attached-mark gravity comes from viscosity and is reserved for Drip and
     Splatter looks.
4. Fill sparse playback samples into one attached sweep, convert the centerline
   into pressure-varying cubic brush segments, and taper both the retained tail
   and live lift. This removes the blunt marker cap and polygon wedges.
5. Replace Ink's three random sources with deterministic cache and point
   sequences so identical frame input produces identical geometry.
6. Attenuate Sumi width, visible path length, and droplet alpha as reflected
   emitter count grows. Clean keeps the full expressive mark; Tunnel keeps
   separation between gestures instead of becoming a gray knot.
7. Add focused tests for sparse-sample continuity, Sumi and Neon physics,
   eight-second bounds, deterministic geometry, Watercolor opacity ownership,
   and the actual side of the reflection. Preserve and update the canonical
   translator suite.
8. Verify the default and every preset in Clean and Tunnel scenes. Inspect the
   required desktop, 4K, tablet, short-wide, and phone viewports. Check the
   browser console and compare before/after stage frames for the Ink overlay.

## Acceptance Criteria

- The default mark follows the prop path. It does not accumulate at the bottom
  of the stage or clip after an eight-second run at tuner speed 0.3.
- The stroke shows a blue-charcoal body, an offset carbon core, broken dry-side
  fibers, turn loading, and a pointed live lift. It must not read as a neon
  trail, gray tube, silver wire, or chain of stamps.
- Slow motion produces a loaded brush; fast motion produces a narrow dry mark.
- Sparse low-speed frames remain one curved mark without polygon wedges.
- Clean keeps the full gesture. Four-fold Tunnel remains legible and does not
  collapse into a solid gray center.
- Watercolor, India, Neon, Blood, and Acid remain visually distinct. None can
  produce the old four-band hose at its shipped preset values.
- Identical renderer input produces identical path, droplet, and texture
  geometry.
- Focused suites and scoped lint pass. Repository-wide gates are run and their
  current baseline is reported without attributing unrelated failures to Ink.
- The production build, browser console check, and viewport screenshots pass.

The viewport gate judges Ink inside the stage actually provided by each host.
Responsive layout and canvas aspect-ratio defects in a test harness are logged
separately and are not counted as renderer proof.

## Risks

- A shared dense-ink branch could alter every palette. The Sumi material branch
  must be explicit.
- Destination-out bristle cuts can erase nearby effects if Ink is not isolated
  on its own overlay. The existing Ink overlay boundary remains unchanged and
  the runtime frame must prove it.
- A bright reflection can turn Ink into Trails. The reflection stays narrow,
  one-sided, and non-additive.

## Production Rejection and Final Art-Direction Pass

The first implementation pass was rejected after a live Clean capture because
its improved geometry still read as scattered gray dashes behind the brighter
prop artwork. The final pass increases the physical brush footprint and uses a
stronger moonlit value split: cobalt wet body, near-black loaded carbon, and a
pale broken dry edge. Tunnel keeps its adaptive density reduction, so the
larger Clean silhouette does not multiply into a solid reflected knot.

## Preset-Surface Rejection and Curation Pass

The second live review used the actual production sequence player at
1920 x 1080, not the isolated Effect Tuner. Every preset was inspected with the
mandala both hidden and visible.

| Look       | Decision | Production evidence                                                                              |
| ---------- | -------- | ------------------------------------------------------------------------------------------------ |
| Default    | Replace  | Sumi produces a few short, thick blue chunks and blunt knots instead of a retained gesture.      |
| Classic    | Remove   | India pigment and droplets disappear into the black stage.                                       |
| Drip       | Remove   | The black material disappears quickly and is unusable over the mandala.                          |
| Watercolor | Remove   | The concept is distinct, but even a stronger continuous wash competes with the mandala geometry. |
| Neon Tag   | Keep     | The narrow pink marks remain legible and visually separate from the mandala.                     |
| Splatter   | Rebuild  | Repeated saturated oval droplets read as dated clip-art debris instead of physical paint impact. |
| Toxic      | Keep     | The lime material is immediately legible alone and stays distinct over the mandala.              |

### Curation implementation

1. Replace factory Sumi with a cool custom pigment using the proven dense-ink
   geometry: high motion emission, low ambient noise, a retained path, modest
   breakup, and both prop ends.
2. Remove Classic, Drip, and Watercolor from `INK_PRESETS`. India, Sumi, and
   Watercolor remain available through Customize, so capability is not deleted.
3. Put Toxic and Neon Tag first in the named-preset order and preserve their
   accepted values.
4. Retune Splatter around a cohesive stroke plus sparse acceleration-triggered
   chips. Lower the preset's breakup pressure and burst count, mute the Blood
   palette to oxblood, and render deterministic pointed chips instead of
   concentric ellipses.
5. Lock the surface composition and factory Default in unit tests. Keep the
   renderer's deterministic geometry tests and add a focused Blood droplet
   shape assertion where it can prevent a silent return to uniform ovals.
6. Re-run the production player matrix with mandala hidden and visible, then
   inspect the required desktop, 4K, tablet, short-wide, and phone viewports.

### Curation acceptance criteria

- The first preset row contains Default and Toxic. Classic, Drip, and Watercolor
  do not appear as named cards.
- Default paints a continuous, restrained gesture comparable in path coverage
  to Toxic. It is not Sumi and does not produce the rejected chunky blue marks.
- Toxic and Neon Tag remain recognizably unchanged.
- Watercolor remains available through Customize but does not appear as a named
  preset.
- Splatter has a visible wet stroke and sparse irregular impact chips. Uniform
  red oval confetti is absent.
- All four shipped looks remain legible on the black stage and composable over
  the mandala.
