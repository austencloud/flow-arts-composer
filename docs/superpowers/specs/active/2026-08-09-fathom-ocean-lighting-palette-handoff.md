---
status: active
value: null
effort: null
remaining: "Verify Fathom — Ocean Lighting and Palette Pass against src/lib/shared/3d/environments/scenes/ocean/OceanScene.svelte before resuming implementation. Prior recorded remainder: Verify ocean lighting palette and carried zone-pass debt against current OceanScene and scene config before action."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Fathom — Ocean Lighting and Palette Pass

- **Ocean steward:** Fathom
- **Mood target:** Moody Twilight Reef (approved by Austen, 2026-08-09)
- **Started:** 2026-08-09
- **Peer stewards:** Bramble (Forest), Elsa (Winter) —
  `docs/superpowers/specs/active/2026-08-08-bramble-elsa-scene-coordination.md`
- **Predecessor spec:** `2026-08-09-ocean-zone-layout-design.md` (composition;
  three passes shipped, do not undo)

## Why this pass exists

A screenshot comparison across Ocean, Autumn, Winter, Forest, and Cosmic in
Scene Lab 3D (2026-08-09) produced a blunt finding: **Forest, built from
untextured primitive blobs, reads as more art-directed than Ocean's 36 MB of
photoreal Meshy coral.** The ocean has the best assets and the best technology
in the program and the worst pictures.

Austen's framing: *"it doesn't have composure it doesn't have artistic
qualities to it ... less like a bunch of stuff that's been slapped into a scene
and more like artfully composed intentional ocean experience."*

Rating at handoff time — asset craft 9, technical systems 9.5, layout 6,
**art direction 4, focal clarity 3, sense of place 4**; overall **6/10**
against Winter and Autumn at 8.5. Composition was addressed in the zone pass.
What remains is entirely light, value, and colour.

### The shared formula the working scenes follow

Every scene that reads as composed does the same four things. Ocean does none
of them.

| | Autumn | Winter | Forest | Cosmic | **Ocean** |
|---|---|---|---|---|---|
| Limited palette | purple/navy vs red-orange | blue/white + one warm | navy vs firelight | near-monochrome + Earth | **6–7 hue families** |
| One motivated key light | moon + warm bounce | campfire | campfire | Earth | **flat ambient, no key** |
| Atmospheric falloff (panel fog) | 0.022 | 0.018 | 0.034 | 0.008 (space, correct) | **0.012 applied** |
| Stage belongs to the scene | warm wood, lit | frozen pond | warm wood, firelit | station ring | **near-black alien slab** |

## Correction to an earlier claim

An earlier message in this thread cited Ocean's fog density as 0.008 from the
Scene Lab panel. **The applied value is 0.012**, hardcoded at
`OceanScene.svelte:139`. The panel's 0.008 comes from
`ocean-scene-config.ts:258` and **does not reach the 3D scene** — see Gate 1,
item 4. The comparative conclusion is unchanged (0.012 is still the thinnest
fog of any underwater-or-terrestrial scene), but the number was wrong and is
corrected here.

## Enumerated recommendations

Ordered by leverage per unit of effort. Items 1–8 are config and lighting and
should land before any Blender work.

### Gate 1 — Atmosphere and depth — **DONE 2026-08-09**

Shipped: `OCEAN_FOG_DENSITY = 0.026` named constant at `OceanScene.svelte`,
replacing the inline 0.012. Verified in Scene Lab 3D. Mid and far field now
recede into blue; the seabed edge is no longer legible at normal camera
heights.

**Two items in the original list were wrong and are corrected here.**

- **Item 2 (ground 180 m → 60 m) does not apply to the 3D path.** The 3D scene
  renders the 70 m seabed GLB; the config's `ground.size: 180` belongs to a
  different (2D/procedural) ocean renderer and never reaches `OceanScene`.
  Fog is the only depth lever in 3D. No change made.
- **Item 4 is bigger than described.** `ScenePreview.svelte:296` renders
  `<OceanScene />` with **no config prop at all**, while every other scene gets
  `config={labState.xConfig}`. The entire Ocean panel — sky, fog, ground, zones,
  coral, fish — is disconnected from the 3D scene, not just the fog slider.
  Wiring it is its own task, deliberately not folded into this gate.

Held at 0.026 rather than pushing higher: the far field is still less dissolved
than Ember or Winter, but Gate 2's key light will darken the periphery on its
own. Re-evaluate the value after Gate 2, not before.

### Gate 1 — original item list (for reference)

1. **Raise fog density from 0.012 to ~0.025–0.030.** `OceanScene.svelte:139`.
   The reef should emerge from blue darkness and dissolve back into it. This
   single change buys the depth layering the zone spec specified and lighting
   never delivered.
2. **Shrink the ground plane from 180 m to 60–70 m.**
   `ocean-scene-config.ts:260`. Content occupies a 20 m radius; the floor is
   180 m across, so most of every frame is bare sand. Autumn is 50 m, Cosmic
   60 m. This is the largest single contributor to the "slapped into a scene"
   read.
3. **Verify the fog colour supports silhouettes.** `#0a2438` at
   `OceanScene.svelte:134`. If heroes go muddy against it at the new density,
   lift its value slightly rather than thinning the fog back out.
4. **Resolve the dead fog/ground controls.** `ocean-scene-config.ts:258–263`
   declares fog `#1a5580` / 0.008 and ground `#5a8898` / 180, but
   `OceanScene.svelte` hardcodes its own fog and ignores them. Decide one
   owner. Austen's Scene Lab sliders currently do nothing for 3D fog, which
   will waste his time the moment he tries to tune this himself.

### Gate 2 — One motivated key light — **DONE 2026-08-09**

Shipped. The scene now has one axis, one key, and real darkness around it.

**A shader bug was the actual reason no god ray had ever been visible.**
`god-ray.frag` ended with `gl_FragColor = vec4(color * alpha, alpha * 0.35)`.
Under `AdditiveBlending` (`SrcAlpha × One`) the blend multiplies by alpha a
second time, so the emitted premultiplied colour was squared: a nominal 0.216
alpha reached the framebuffer at `0.35 × 0.216² = 0.016`. The shafts were
mathematically invisible. Fixed to `vec4(color, alpha)`. **Consequence:
`uIntensity` now reads roughly 25× stronger than the same number did before —
do not compare it to any historical value.** The vertical fade was also
inverted (`smoothstep(1.0, 0.5, vUv.y)` erased the entire top half, so a shaft
was brightest in the dark deep and absent where it enters the water); replaced
with a top-down attenuation plus a `depthFalloff` term.

**New shared owner: `runtime/atmosphere/god-ray-axis.ts`.** The sun vector, the
lean angle, the water plane, the hero's landing point, and the stage deck height
were previously duplicated across `GodRayShafts` and `OceanRuntimeSystems`, so
the visible column and the light it was supposed to explain could drift apart
silently. Everything now derives from `COLUMN_UP`, including
`shaftCentreForTarget()` (solves a tilted column's centre backwards from where
it must land) and `keyLightPosition()` (walks the same axis up to the water
plane).

**What landed, per item:**

| Item | Result |
|---|---|
| 5 — dominant hero shaft | Promoted instance 0 of the existing `GodRayShafts` instanced mesh; no new light type. Broadside to camera, no lean jitter, coaxial with the key spot. Supporting cast is 13 golden-angle columns on a 7.5–15 m annulus, trimmed to 0.10–0.20 opacity so none of them outranks the hero. |
| 6 — rebalance the rig | Hemisphere 0.2 → 0.09, directional 0.9 → 0.28, and a new `SpotLight` (260, `angle 0.30`, `penumbra 0.55`, `distance 34`, `decay 2`) travelling down the hero column's axis onto the deck. No `castShadow` on the spot — the reef is ~54M verts/frame and the directional already spends one shadow pass; the cone's falloff is what makes the darkness. |
| 7 — torches as accents | 40 → 26, and reach 18 → 10. The reach was the real problem: an 18 m radius from the stage's front corners washed the entire foreground seabed orange, which is a large part of what read as "salmon sand". |
| 8 — IBL | 0.08 → 0.05. An omnidirectional specular wash is exactly what stops a keyed scene from having a dark side. |

**Two corrections to the original item list:**

- **The sun's colour had to change, and item 6 did not anticipate it.**
  `#ffffdd` → `#dde8ee`. At 10 m depth sunlight is already strongly
  blue-shifted, and the warm sun was the single largest amplifier of the salmon
  seabed albedo. An intermediate attempt at `#cfe0f0` over-cooled and bleached
  the mid-ground coral to pale cyan; `#dde8ee` at 0.28 holds the coral's colour.
- **Cone geometry, not intensity, is what makes a key read.** The first working
  version used `angle 0.42 / penumbra 0.8`, which puts a 9 m-wide circle over an
  8×6 m stage — the cone was *larger than its subject*, every falloff edge fell
  outside the frame, and the result read as fill. Narrowing to 0.30 (a ~6.1 m
  pool that sits inside the deck) is what produced a visible pool. Intensity
  followed the area, 190 → 260. **Do not tune this light by intensity alone.**

**Gate 4 item 13 was pulled forward, because Gate 2 could not be verified
without it.** At `stoneColor: "#1a2028"` the deck rendered as a flat black
silhouette: the rune network — the stage's entire design feature — was
invisible, and with no legible surface there was no way to tell a pool from a
wash. Now `#5a6672`. An intermediate `#3d4753` was still near-black in linear
terms (only ~4× `#1a2028`, which was already black) and is recorded here so the
next pass does not retry it. Items 14–16 remain open.

**Verified** in Scene Lab 3D at 1920, 3840, 1440×900, 820×1180, 960×412, and
375×667 (the distinct aspect ratios; 2560 is the same 1.78 framing as 1920 at a
different scale). `npm run check`: 0 errors, 0 warnings. Before/after at 1920:
`ocean-gate2-before-1920.webp` / `ocean-gate2-after-1920.webp`.

**Honest residual — read this before Gate 3.** Two things still hold the frame
back and neither is a Gate 2 item:

1. **The foreground sand is still the brightest thing in the lower half.** It is
   salmon, it is high-albedo, and it pulls the eye off the stage. This is item
   11 and it is a Blender/texture change.
2. **The hero shaft is partly occluded by the arch.** It reads *through* the
   aperture, which is a genuinely good composition, but it means the beam is
   atmospheric rather than unmistakable. Whether to move the stage, the arch, or
   the hero's landing point is a Gate 4 composition call, not a lighting one.

### Gate 2 — original item list (for reference)

5. **Establish a single dominant god-ray shaft from the surface, landing on
   the stage.** This is the ocean's campfire: a key light the setting itself
   justifies. Existing owner is `runtime/atmosphere/GodRayShafts.svelte`;
   prefer promoting one shaft to hero status over adding new light types.
6. **Rebalance the rig so darkness exists.** `OceanRuntimeSystems.svelte`:
   `HemisphereLight` 0.2 (line 62), `DirectionalLight` 0.9 (line 71), two
   `PointLight` torches at 40 (lines 83, 90). Everything is currently lit
   evenly, so nothing is emphasised and nothing recedes. Target a bright pool
   on the stage with falloff toward dark blue past the reef.
7. **Keep the torches as warm secondary accents.** They are motivated
   (exported from Blender as `Torch_Light_0/_1`) and they are the only warm
   light in the scene today. They should read as accents against the cool key,
   not as general fill.
8. **Check the IBL contribution.** `OceanScene.svelte:152–159`, currently 0.08
   `RoomEnvironment`. A flat specular wash fights the moody target; the dev
   `ibl` toggle exists precisely to A/B how much washout it owns.

### Gate 3 — Palette discipline (Blender + materials)

9. **Cut to two hue families plus one accent:** blue-teal environment, warm
   coral accent, everything else desaturated toward the water. Restraint is
   what reads as taste.
10. **Reduce coral variety by roughly a third.** Magenta, orange, and
    yellow-green currently all compete at full saturation. The scene will get
    better as it loses objects. Prefer desaturating the losers over deleting
    them where the silhouette is doing useful work.
11. **Cool the sand.** The salmon-orange seabed fights the water in every
    frame. The driver is the seabed GLB texture, not the config ground colour,
    so this is a Blender/texture change routed through the standard pipeline.
12. **Let the caustics carry the warmth** instead of the sand's base colour.

### Gate 4 — Stage integration

13. **Re-material the dais toward pale stone or sea-sand.** It is currently the
    darkest object in a frame whose subject is the performer standing on it.
14. **Make the stage the brightest object in frame**, lit by the Gate 2 shaft.
    In Winter the stage is a frozen pond; in Autumn and Forest it is firelit
    wood. In Ocean it is made of nothing in the scene.
15. **Demote the bioluminescent cracks to an accent.** They are currently the
    only feature the stage has. Owner is `runtime/RuinsPlatform.svelte`.
16. **Add a soft rim or up-light** so the dais edge separates from the seabed.

### Gate 5 — Verification and production

17. **Screenshot the required viewport set** per
    `.claude/rules/visual-verification-mandatory.md`.
18. **Before/after at identical camera positions**, not new flattering angles.
19. **Side-by-side against Autumn and Winter.** The bar is "does this belong in
    the same program", and that is only answerable by comparison.
20. **Re-bake and upload.** Export → optimize → **R2 re-upload** (see Carried
    debt).

## Guardrails

- **Do not undo the zone layout.** Passes 1–3 (`ocean_zone_recompose.py`,
  `ocean_zone_refine.py`, `ocean_zone_pass3.py`) shipped composition,
  intersection separation, and species logic. Lighting work must not re-scatter
  placements. `blender/ocean_scene.pre-*.blend` backups exist per pass.
- **The stage stays procedural.** `RuinsPlatform` is an animated shader that
  cannot bake to glTF — the documented exception to `blender-first-3d-scenes.md`.
  Re-material it; do not replace it with a GLB.
- **Any geometry or texture change goes through the Blender pipeline**
  (`blender-first-3d-scenes.md`), not hand-authored Threlte primitives.
- **Shared owners are announced before editing.** `SkyGradient.svelte`,
  `Starfield.svelte`, `EnvironmentReviewCamera`, and scene-config types are
  shared with Bramble and Elsa. Announce in the coordination file first.
- **Visual verification is not delegable.** Design fan-outs produce documents,
  not pixels. Build it and look at it (`fable-routing.md` → Workflow Cost
  Discipline).
- **Scoped commits only** (`commit-only-your-own-changes.md`). Multiple agents
  share this checkout; one already swept these files mid-flight on 2026-08-09.

## Carried debt from the zone pass

| Item | State |
|---|---|
| R2 re-upload of `ocean_flora_scene.glb` | **Open.** Production serves from R2; dev/localhost is current. Every zone pass so far is invisible in prod. |
| Wreck (`boat.glb` + `octopus.glb`) | **Open.** Not yet in `ocean_scene.blend`; needs import + decimation. Zone `wreck-hollow-southeast` is reserved for it. |
| Fauna cluster anchors → zone anchor points | **Open.** `fish-compute.ts:121-132` still seeds an even ring. |
| Residual small-rock contacts at skyline hero bases | **Accepted.** Reads as natural set dressing. |

## Reference paths

| Purpose | Path |
|---|---|
| Scene root | `src/lib/shared/3d/environments/scenes/ocean/OceanScene.svelte` |
| Lighting rig | `.../ocean/runtime/OceanRuntimeSystems.svelte` |
| Stage | `.../ocean/runtime/RuinsPlatform.svelte`, `OceanStage.svelte` |
| God rays | `.../ocean/runtime/atmosphere/GodRayShafts.svelte` |
| Config (sky/fog/ground/zones) | `src/lib/shared/3d/environments/domain/models/scene-configs/ocean-scene-config.ts` |
| Authored placements | `.../ocean/authored/placements.ts` |
| Zone contract | `scripts/ocean-zone-layout.json` |
| Blender source | `blender/ocean_scene.blend` |
| Export → optimize | `scripts/blender-export-ocean-full.py` → `scripts/optimize-ocean-glb.mjs` |
| Review surface | Scene Lab → Ocean → 3D (`/lab/themes`) |

## Definition of done

The ocean reaches parity with Winter and Autumn: a viewer who sees a still
frame with no context can name the mood, find the subject in under a second,
and would not guess the scene was assembled from a catalog. Target 9/10.
