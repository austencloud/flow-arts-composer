---
status: active
value: null
effort: null
remaining: "Verify Winter clearing deviation, authored assets, visual proof, and runtime placement against the current hollow scene."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Moonlit Winter Hollow

Status: Pass two implemented and reviewed on 2026-08-08. Further work is
governed by the
[Pass Three gated production plan](../../plans/active/2026-08-08-winter-environment-pass-three.md).

## Outcome

Winter must hold up as a complete place at both the hero camera and walking
distance. A broad, level performance clearing sits inside a mixed-age evergreen
forest. Mature firs form lush masses, younger pines break the silhouette, and
snow-covered deadwood and stone read as parts of the same ecology. A large
frozen pond anchors the left side. Forest's existing moon and stars own the sky.

The first authored pass established the terrain, clearing, warm versus cool
lighting, and overall composition. It failed at close range. This pass replaces
every placeholder-grade prop and treats close-up fidelity as a shipping gate.

## Evidence from pass one

- The imported `fir_sapling` and `pine_sapling_small` sources are young trees,
  yet the build scaled them to heights from 8 to 17.8 metres. Their trunks and
  crowns therefore remained thin even when enlarged.
- Winter rocks were deformed icospheres made in the build script.
- Winter logs were cylinders made in the build script.
- The scanned stump was placed directly on the terrain with uniform scale and
  no burial, snow skirt, roots, or related debris.
- The frozen pond used a generic runtime reflector. In the walking view it read
  as a small dark polygon with block-shaped reflection artifacts.
- The visible moon was a Blender UV sphere. The two distant ridges were faceted
  vertical rings that read as walls instead of terrain.

These are source and composition failures. Lighting adjustments cannot repair
them.

## Source of truth

- `blender/winter_environment.blend` is the editable authored scene.
- `scripts/build-winter-environment.py` deterministically rebuilds the scene and
  its QA cameras.
- `scripts/blender-export-winter-full.py` excludes runtime sky, lights, water,
  fire, and QA objects.
- `scripts/optimize-winter-environment.mjs` creates the production GLB.
- `static/models/winter/winter-environment.glb` is the runtime asset.
- `src/lib/shared/3d/environments/scenes/winter/authored/winter-layout.ts`
  carries layout values shared with runtime code and tests.

## Capability ownership

- **Reuse `SkyGradient.svelte` and `Starfield.svelte`:** the sky gradient owns
  the directional, angular-size Moon and Forest already shares the same
  celestial behavior. Winter supplies its own configuration only.
- **Reuse Autumn's production rock sources:** `boulder_01.glb`, `rock_07.glb`,
  and `stone_01.glb` already pass through the Blender and optimization path.
- **Reuse Autumn's detailed fallen-log source:** Winter may retune its material
  and snow coverage, but must not rebuild a log from primitives.
- **Extend the shared organic pond-shape owner:** Autumn water and Winter ice
  share outline construction. Their material behavior remains separate because
  moving water and frozen ice have different contracts.
- **Compose existing runtime owners:** snowfall, volumetric fire, steam,
  directional moonlight, fog, readiness reporting, and `IcePlatform` stay with
  their current components.
- **Create no parallel sky, rock, log, water-reflection, or particle system.**

## Composition contract

### Performance clearing

1. Keep a mathematically flat eight-metre-radius clearing around the performer.
2. No tree trunk, rock, stump, log, pond bank, or steep terrain may enter the
   clearing or its one-metre visual buffer.
3. The ice platform remains centered and visually dominant.
4. The campfire stays beyond the platform without blocking a movement path.

### Evergreen age and silhouette mix

The forest needs three readable age classes.

| Class                   |    Count |     Height | Visual job                                                 |
| ----------------------- | -------: | ---------: | ---------------------------------------------------------- |
| Mature hero fir or pine |  8 to 10 | 13 to 19 m | Broad, dense crowns that frame the clearing                |
| Mid-age conifer         | 12 to 16 |  8 to 13 m | Irregular middle layer with visible trunks and branch gaps |
| Sapling and young pine  | 12 to 18 |   3 to 8 m | Fine foreground detail and natural regeneration            |

Requirements:

- Use at least three mature-tree silhouettes and both fir and pine families.
- No sapling source may be scaled above eight metres.
- At least eight trees must have a crown width of 30 percent or more of their
  visible height.
- Dense trees cluster in groups of two or three. They must not form an even
  radial ring.
- Preserve two wide orbit sightlines into the clearing.
- Foreground branches may frame the camera but must not cover the performer or
  more than one quarter of the platform.
- Snow loading is irregular. It may collect on upward branches, root flares,
  and windward crown sections. Repeated white discs or identical caps fail.

### Rock and deadwood ecology

- The production GLB contains no procedural icosphere boulders and no
  cylindrical fallen logs.
- Use all three Autumn rock families with nonuniform scale, yaw, tilt, and
  burial depth.
- Bury rocks by 15 to 35 percent of their height. Their contact edge receives a
  snow skirt or terrain overlap so no rock appears to float.
- Use at least two detailed fallen-log or dead-trunk silhouettes.
- Fallen timber must expose broken ends, bark variation, branch remnants, or
  decay. A smooth circular extrusion fails.
- Keep one hero stump at most. Sink its root mass into the snow, orient it to
  the local slope, and compose it with a log or branch debris. An isolated stump
  in open snow fails.
- Props form three to five small ecological vignettes near the tree line. No
  loose object is placed merely to fill empty ground.

### Frozen pond

The pond is a secondary focal area, not a background puddle.

- Increase its visible surface area by at least 35 percent from pass one while
  keeping its nearest bank outside the performance buffer.
- The hero camera must show a continuous section of the ice and a readable
  snow shelf around its edge.
- Keep the outline organic and asymmetrical.
- The basin owns bank geometry, burial, nearby stones, and snow buildup.
- The runtime surface uses layered physical ice, not a planar scene reflector.
- Ice includes large-scale value variation, fine roughness, restrained cracks,
  trapped bubbles or cloudy depth, and a thin clear top layer.
- Reflections may be implied through clearcoat and grazing highlights. No
  square reflection patches, mirror-black surface, or hard polygon edge may be
  visible.
- Remove or relocate trees that obscure the pond from the hero camera.

### Sky and horizon

- Remove `Winter_Base_Moon` from the Blender scene and production GLB.
- Composite `/textures/moon.png` inside the shared `SkyGradient` using a fixed
  celestial direction and apparent angular diameter.
- Render stars with the existing shared `Starfield`.
- Retain directional moonlight as scene lighting. It is separate from the moon
  image.
- Remove both faceted ridge rings.
- Use terrain slope, tree depth, fog, and the star sky for the horizon. Any new
  distant snow mass must be a shaped terrain form with a broken silhouette, not
  a vertical circular wall.

## Runtime and quality contract

- The authored GLB owns terrain, pond basin and bank, trees, rocks, deadwood,
  stumps, and static snow contact forms.
- Runtime owns the pond surface, snow particles, fire, steam, sky, lights, fog,
  and platform.
- High, Medium, and Low tiers remove detail cumulatively. Every tier keeps the
  mature hero tree groups, pond basin, campfire context, and primary prop
  vignettes.
- Linked Blender mesh data must survive as GPU instances where repeated.
- Use alpha masking for conifer foliage. Transparent blending is not permitted
  on tree cards.
- Production textures are WebP at no more than 1024 pixels per axis unless a
  close-up comparison proves that one named hero texture needs 2048 pixels.
- Keep the production GLB under 20 MiB. A larger result requires measured
  evidence and explicit approval.

## Scene Lab contract

- Existing sky, fog, snow, campfire, directional light, platform, and forest
  detail behavior stays editable.
- Moon and stars use the shared config types.
- Pond color and roughness controls may remain. Position and size stay authored
  because they must align with the basin.
- Existing saved Winter settings merge into fresh defaults. Stale pond position
  and radius values must not displace the authored surface.

## Verification gates

### Deterministic assertions

- Clearing maximum deviation is at most 0.02 m.
- Every obstruction stays outside the nine-metre performance buffer.
- The nearest pond bank stays outside that buffer.
- Tree age-class counts and crown-width requirements pass.
- No exported object name contains `Moon`, `Ridge`, `PrimitiveBoulder`, or
  `CylinderLog`.
- Required mature-tree, rock-family, and deadwood-family names exist.

### Asset inspection

- GLB verifier proves meshopt compression, WebP textures, quantization, and GPU
  instances.
- Production size remains within budget.
- Alpha foliage, normal maps, and ice textures are present after optimization.

### Visual proof

Inspect all of these before completion:

1. Hero wide shot.
2. Reverse wide shot.
3. Mature-tree close-up showing a lush crown and grounded root area.
4. Rock vignette close-up showing burial and snow contact.
5. Deadwood close-up showing a non-cylindrical silhouette.
6. Stump close-up showing root burial and related debris.
7. Pond close-up showing banks, cracks, cloudy depth, and no reflection blocks.
8. Low walking view through both orbit openings.
9. Browser viewports at 1920x1080, 2560x1440, 3840x2160, 1440x900,
   820x1180, 960x412, and 375x667.

The scene fails if the wide shot hides a weak close-up asset. Console health,
focused tests, and the project check must also pass before completion.

## Files in scope

- `docs/superpowers/specs/active/2026-08-08-moonlit-winter-hollow-design.md`
- `docs/superpowers/plans/active/2026-08-08-winter-hero-environment.md`
- `assets/3d-source/winter/*`
- `blender/winter_environment.blend`
- `scripts/fetch-winter-environment-assets.mjs`
- `scripts/build-winter-environment.py`
- `scripts/blender-export-winter-full.py`
- `scripts/optimize-winter-environment.mjs`
- `scripts/verify-winter-environment-glb.mjs`
- `static/models/winter/winter-environment.glb`
- `static/textures/winter/*`
- `src/lib/shared/3d/environments/domain/models/scene-configs.ts`
- `src/lib/shared/3d/environments/primitives/organic-pond-shape.ts`
- `src/lib/shared/3d/environments/scenes/AutumnScene.svelte` only if required
  by the shared pond-shape extraction
- `src/lib/shared/3d/environments/scenes/WinterScene.svelte`
- `src/lib/shared/3d/environments/scenes/autumn/runtime/water/AutumnPond.svelte`
- `src/lib/shared/3d/environments/scenes/winter/*`
- `src/lib/features/lab/tabs/scene-lab/components/WinterControls.svelte`
- `src/lib/features/lab/tabs/scene-lab/state/scene-lab-state.svelte.ts`
- `src/routes/test/winter-scene/*`

Other environments, museum work, avatar behavior, shared browser state, and
unrelated dirty files are out of scope.
