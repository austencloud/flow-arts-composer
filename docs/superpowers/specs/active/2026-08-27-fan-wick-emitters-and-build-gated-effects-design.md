---
status: active
value: null
effort: null
work_state: verification
remaining: Verify build-aware emitters, per-performer build, and auto-equip against the shipped code and visual acceptance.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Fan Wick Emitters and Build-Gated Effects

**Date:** 2026-08-27
**Status:** Implemented in 2026-08-27; current acceptance verification pending. Phase 1 (build-aware emitters) and Phase 2
(per-performer build) landed earlier; Phase 3 (auto-equip) landed in
`2b04dcd094`.

## The one sentence

A prop's build belongs to the performer holding it, the build decides where the
effect emitters are, and choosing an effect equips the build that can carry it.

## Why

Two defects sit next to each other on the Performers panel, and they turn out to
be the same defect seen from two sides.

**The fire fan does not burn from its wicks.** `resolvePropTipAnchors3D`
(`src/lib/shared/3d/effects/prop-tip-geometry-3d.ts:220`) returns exactly one
anchor for any single-ended prop, expressed as a scalar offset along the prop's
local +Y axis. For the fan that is `FAN_REACH_RATIO` (0.50831 x staff length), a
single point out at the far rim. An off-axis wick cannot be expressed, so all
five collapse into one flame in the wrong place.

This is not a fan bug. It is every multi-tip prop. The triad has three tips in
2D and one in 3D; the quiad has four and one. 3D is the only layer that lost the
count, and it lost it against two existing sources of truth:

- `src/lib/shared/animation-engine/domain/types/prop-tip-points.ts:112` —
  `FAN_TIP_POINTS`, a five-point `dx`/`dy` table. `fire-tip-tracker.ts:277`
  reads it via `getTipPoints(propType)` and feeds all five to the 2D WebGL fire
  renderer, which caps at 16 tips. 2D has burned from five wicks the whole time.
- `static/models/props/fan.glb` — `Fan_Fire_Wick_1..5`, built at measured
  positions by `scripts/build-fan-model.py:660` and already gated by
  `scripts/verify-fan-glb.cjs`.

**Any prop can be set on fire, including ones that cannot burn.**
`src/lib/shared/animation-engine/components/effects-panel/effect-registry.ts:56`
holds sixteen effects and has no awareness of prop, build, or finish. Fire on a
Day fan is permitted because nothing has ever asked the question. The wick cover
belongs in the same conversation: a covered fire fan physically cannot burn, and
that control sits on the same panel.

## What the code forced into the design

### The fan's emitters are build-dependent

The three fan builds are three different physical objects with three different
emitter sets, and one of the three scales while the other two do not.

| Build | Source | Emitters | Scaling |
|---|---|---|---|
| Pictograph | `FAN_TIP_POINTS` | 5 rib ends, ~0.418 m at a 32in staff | scales with staff length |
| Fire | `scripts/assets/doodlegrip-fire-reference.json` | 5 wick centres | fixed 48.26 x 33.02 cm |
| Day | none measured — see below | 5 rib ends | fixed 51 x 35 cm |

Measured fire wick centres, prop-local metres, `(across, along)`:
`(+/-0.2217705, 0.10651613)`, `(+/-0.13347299, 0.20877161)`, `(0, 0.25363129)`.

`Fan3D.svelte` scales the GLB by the `scale` prop only, never by
`effectiveLength`, so the fire and day builds are fixed real-world objects. Only
the pictograph plate follows the user's staff length. Wick positions are
therefore absolute metres, following the `CAPSULE_BATON_REACH_M` /
`FIRE_DOUBLE_STAFF_REACH_M` house pattern, not a ratio.

### Build is global while prop and effect are per-performer

`setEffect` is per-performer
(`src/lib/shared/3d/state/avatar-instance-state.svelte.ts:897`). Prop type is
per-performer. Fan build, cover, frame colour and finish are a global singleton,
and `ScenePropPicker.svelte`'s header comment documents this as intentional:
*"which is global — the build a person picks here is the build the scene renders
everywhere."*

Auto-equip has to write that state. Left global, lighting one performer changes
every performer's fans. **Decision: build becomes per-performer.** It is the
consistent model, and it unlocks mixed-gear staging — one dancer on lit fire
fans beside six on practice fans.

## Design

### 1. Build becomes a per-performer override; the global becomes the default

```ts
export interface PropBuild {
  finish: PropFinish;            // fire | day        — triad, quiad
  fanBuild: FanBuild;            // pictograph | fire | day
  fanFrameColor: FanFrameColor;  // black | white
  fanCover: FanCover;            // bare | covered
}
```

- `propFinishState` keeps its current API and demotes from authority to **scene
  default**. It gains a `build` getter returning the current `PropBuild`.
- `Prop3DProps` gains `build?: PropBuild`, falling back to `propFinishState.build`
  when omitted. Every existing call site — Prop Studio capture, collision lab,
  fan-relations, spatial lab — keeps working with no edit.
- `PerformerRig` gains `propBuild?: PropBuild`, passed to both `<Prop3D>`s,
  sitting beside `propLength`, which is already per-performer.
- `avatar-instance-state` gains `propBuild: Partial<PropBuild> | null` with
  `setPropBuild` / `resetPropBuild`, following the exact null-means-inherit
  pattern `prop`, `effect` and `effortId` already use, undo entries included.
- `ScenePropPicker` gains a build seam alongside its existing `accentColor` /
  `showBareHands` props, reading and writing either the scene default or a
  performer's override depending on the host's scope. Its header comment is
  rewritten — it is currently load-bearing documentation of the thing being
  changed.

Six files read `propFinishState` today; two are prop components
(`Fan3D.svelte`, `Prop3D.svelte`).

### 2. Emitters come from the build

`PropTipAnchor3D.axialOffset: number` becomes `offset: { x, y, z }` in prop-local
metres — +Y reach, +X across, the convention `fan-profile.ts` documents. The
two-anchor cap is removed. `resolvePropTipAnchors3D(propType, staffHalfLength)`
gains a `build` parameter and stays pure; callers
(`EffectOrchestrator3D.svelte`, `EffectsLayer.svelte`) already sit where the
build is readable.

`effectTipIndex` stays `0 | 1`. It is the effect-assignment slot, not an emitter
index — all five wicks sit on slot 1 because they are all one end of the prop —
so per-tip effect assignment keeps meaning what it means in 2D.
`TipPositionData3D.tipIndex` is untouched. Downstream renderers already loop over
N tips (`FireRenderer3D.update(tips[])`).

New owner module `prop-build-tip-geometry-3d.ts`, keyed by (propType, build):

- **Fan / fire** — the five measured wick centres as absolute metres,
  transcribed from `doodlegrip-fire-reference.json` with the script cited.
  `build-fan-model.py` bakes `tka_wick_centers_m` into the GLB root extras;
  `verify-fan-glb.cjs` gains an assertion that the TypeScript constants match the
  baked `Fan_Fire_Wick_1..5` positions.
- **Fan / day** — no measured tip data exists; `doodlegrip-day-contours.json`
  holds only a traced `outline` and `holes`, and the GLB names no day tip nodes.
  **Superseded during implementation** (2026-08-27): the original plan here was
  to scale `FAN_TIP_POINTS` into the day fan's 51 x 35 cm envelope. That mixes
  two reference lengths — the tip table is normalized to the staff's 252.8-unit
  drawn span, not to its own extent — and the first implementation landed day
  emitters ~29% closer to the hand than the physically SMALLER fire fan's.

  What shipped instead: that `outline` is already pivot-relative metres, so the
  five emitters are sampled off the real traced rim along the same five bearings
  the fire fan's wicks occupy (0 and +/-32.592 and +/-64.345 degrees from +Y).
  Still derived rather than measured, but derived from the day fan's own trace.
  The rim is the right emitter for a day fan anyway — the rim is what a trail,
  an LED strip or a sparkle plume traces. Rib-apex extraction remains the
  upgrade if it reads wrong on the scene.

  Day emitters are not dead weight even though a lit fan is always the fire
  build: trails, LED, sparkles and ghost all run on a day fan.
- **Fan / pictograph** — derived from `FAN_TIP_POINTS`, scaling with staff
  length.
- **Triad (3), quiad (4)** — directions and relative radii from their existing
  2D tables, which already carry the correct counts; absolute reach from the
  3D frame constants (`TRIAD_ARM_LENGTH`, `QUIAD_ARM_LENGTH`) the single-emitter
  path already used. Normalizing the tables by 252.8 instead would have put
  triad emitters 5% inside the actual wick.
- **Big variants** — `Prop3D.svelte` renders BIGFAN and BIGTRIAD by handing the
  base component `scale={1.4}`, which scales the whole group, GLB included. Both
  therefore take the base prop's full emitter set multiplied by 1.4. Missing this
  left them on one axial anchor while FAN got five. (`BIG_VARIANT_MAP` names
  30/13 for BIGFAN; it has no consumers and is not the authority.)
- **Everything else** — today's single or dual axial anchor, unchanged.

Where `prop-tip-points.ts` already has the answer, read and convert rather than
retyping numbers. It remains the owner of emitter counts and positions for
scaling props; the new module owns positions for builds that are fixed physical
objects.

**Velocity history must be re-keyed, or the flames go chaotic.**
`tip-position-bridge-3d.ts:227` keys history as `` `${propIndex}-${tipIndex}` ``.
Because all five wicks correctly share `effectTipIndex: 1`, five emitters would
collide on one history entry and overwrite each other's `prevPosition` every
frame. The resulting velocity and jerk are garbage, and they drive fire poof
intensity, charcoal bursts and trail spawn — so the symptom is not a subtle
one. The key needs an emitter ordinal, and the stale-signature cleanup at
`:198`, which hardcodes `-0` and `-1`, must delete every emitter's entry.

The transform itself is nearly free: the bridge already computes `finalQuat` and
then discards everything but its +Y axis. A prop-local offset becomes
`offset.clone().applyQuaternion(finalQuat)` in place of
`tempAxis.multiplyScalar(axialOffset)`.

Six call sites consume the current scalar shape: `EffectOrchestrator3D.svelte:188`
and `:193`, `EffectsLayer.svelte:242` and `:248`, `tip-position-bridge-3d.ts:190`
and `:208`, plus the `axialOffset` assertion in `sickles-registration.test.ts:45`.

### 3. `buildForEffect(propType, effect, current)`

A pure domain module returning the prop-type and build changes an effect
requires, or `null` when nothing needs to change.

| Prop | Effect | Result |
|---|---|---|
| Fan | fire | `{ fanBuild: "fire", fanCover: "bare" }` |
| Triad, Quiad | fire | `{ finish: "fire" }` |
| Club | fire | equip Torch |
| Staff | fire | equip Fire Staff |
| Staff, Fire Staff | led | equip LED Baton |
| Chicken, Guitar, Buugeng, Hoop, Sword, ... | fire | `null` — burns as-is |
| any | effect off | `null` — the build stays |

The club-to-torch and staff-to-fire-staff cases change `PropType`, but
`SCENE_PROP_FAMILIES` already models these as *builds* of one family ("Club
build", "Double Staff build"), so they are the same user-facing action as a fan
build switch. Swaps stay strictly within a family; never across.

Called from inside `setEffect`, **in the same undo entry**. `setEffect` today
pushes its own entry; a second entry for auto-equip would make Ctrl+Z leave the
effect off with the fans still on the fire build.

### Decisions taken, and what they rule out

- **Effect equips the build**, rather than hard-gating, warning, or doing
  nothing. No disabled chips, no dead ends, no two-step dance.
- **Props with no fire build burn anyway.** Auto-equip fires only where a real
  build exists. Gating a chicken out of fire encodes our missing model as the
  prop's limitation; real fire hoops and fire buugeng exist.
- **The pictograph fan follows the same rule as Day** — fire replaces it with
  the real fire fan. One rule, no carve-outs.
- **Build is per-performer**, not global and not scope-conditional.

## Testing

- Unit: `buildForEffect` across every prop x fire / led / coal, including the
  effect-off and no-build-exists paths.
- Unit: `resolvePropTipAnchors3D` returns five anchors at the measured metres for
  fan/fire, five scaling anchors for fan/pictograph, three for triad, four for
  quiad, and unchanged results for every other prop.
- Contract: `verify-fan-glb.cjs` gates the TypeScript wick constants against the
  baked GLB node positions.
- Undo: effect and build revert together as one entry.
- Visual: the seven-performer fire fan scene, screenshotted, showing five flames
  per fan located on the wicks. Per `visual-verification-mandatory.md` this is
  the evidence, not the test count.

## Risks

**Particle budget.** Seven performers x 2 hands x 5 wicks is 70 emitters where
there are 14 today. `FireRenderer3D` shares one particle pool across all active
tips, so unless the pool scales with emitter count each wick receives a fifth of
the density a single rim flame gets now. Real fire fans do read as five distinct
small flames, so this may be correct rather than wrong — settled during the
tuning pass by looking at the scene, not by arithmetic.

**`@austencloud/scene-3d` is a patched package.** Phase 1 touches
`Prop3DProps.ts`, `Prop3D.svelte`, `Fan3D.svelte`, `PerformerRig.svelte`,
`prop-finish-state.svelte.ts` and the barrel. Follow
`reference_scene3d_patch_workflow`: a fresh edit dir every time, verify the
patch's file set is a superset of HEAD's, and grep the patch and node_modules for
the actual code strings before committing. Five clobber incidents are on record.

## Staging

Three phases, one spec, one user story. **Emitters go first**, not the state
model, because emitters are the only phase that touches no patched package and
they carry the entire visible win.

1. **Build-aware emitters.** Reads the build from the existing
   `propFinishState.fanBuild` / `.finish` getters, which already exist — so this
   phase is confined to app-side files (`prop-tip-geometry-3d.ts`, the new
   module, `verify-fan-glb.cjs`, `build-fan-model.py`) and needs no
   `pnpm patch` at all. Independently shippable, fixes triad and quiad on its
   own, and is the phase that makes the fans actually burn from their wicks.
2. **Per-performer build.** The state model and the picker seam. This is the
   phase that touches `@austencloud/scene-3d` and therefore carries the patch
   risk. Phase 1's build lookup changes from the global getter to the
   per-performer value here — a one-line change at one call site, a cheap price
   for getting the visible fix out ahead of the risky refactor.
3. **Auto-equip.** Depends on both. Shipped as
   `src/lib/shared/3d/domain/build-for-effect.ts`, called from `setEffect`
   AND from `setProp` — the hole runs both ways, and handing a burning
   performer a day fan is the same defect reached from the other side.
   `setProp` equips only across a catalog-family change, so an in-family
   build choice (Staff from the Double Staff radio while lit) still wins.
   Both take `{ equipBuild: false }`, which every restore path passes:
   replaying a stored effect is not a performer choosing one, and equipping
   there writes back overrides the saved scene deliberately does not carry.

## Related

- `.claude/rules/effects-earn-their-slot.md`, `.claude/rules/canonical-capabilities.md`
  (3D prop picker row), `.claude/rules/never-hand-roll.md`
- `.claude/rules/visual-verification-mandatory.md`
- Memory: `reference_scene3d_patch_workflow`, `feedback_tipeffectmap_sync`,
  `feedback_two_props_always_reachable`
