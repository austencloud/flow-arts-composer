# Blue Hour Lodge

Winter's current production venue, replacing Moonlit Winter Hollow on 2026-09-05.
The former asset and its evidence remain available.

The performer occupies a 15.4 m slate court connected to a sheltered alpine
longhouse. A glazed larch facade, reading room, broad promenade, side hearth,
frozen tarn and mixed-age conifers form the middle distance. Three sculpted
mountain ridges enclose the basin. The entrance and shore paths reach actual
destinations, and furniture starts beyond the clear floor.

## Source and delivery

- Editable, packed source: `blender/winter/blue-hour-lodge.blend`.
- Production asset: `static/models/winter/blue-hour-lodge.glb`.
- Measurements, checksum and size: `blue-hour-lodge-manifest.json`.
- Scene review: `/test/winter-scene`; add `?performers` for the real viewer or
  `?performers&worker` for its worker backend.

Re-export edits made in Blender from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' --background --factory-startup --threads 8 --python scripts/blender-export-winter-bluehour.py
node scripts/optimize-winter-bluehour.mjs
```

`scripts/build-winter-bluehour.py` reconstructs the initial composition from the
previous Winter source library. If that untracked authoring library lives outside
the checkout, set `TKA_WINTER_SOURCE` to its absolute `.blend` path. This is only
needed for reconstruction; the committed new source contains the reusable assets
and packed images needed for normal Blender editing and export.

The exporter preserves semantic roles and excludes cameras, authoring lights and
the Blender pond preview. The optimizer retains shared conifer meshes as GPU
instances and caps textures at 1024 pixels. Runtime owns the existing sky, moon,
snow, smoke, volumetric fire, ice material and lighting. Both renderer adapters
construct the same `winter-environment-world`; the boot manifest prefetches the
new asset. Ground height and cast growth use the canonical stage owners.

Exported tangent attributes caused black frames in the production bloom pass on
the review GPU. The final export omits them and retains the normal maps; Three.js
derives tangent frames from the UVs. glTF Validator reports eight generated-tangent
warnings for this intentional choice. Both production renderers were inspected
with bloom active after the correction.

## Mountain pass

The three placeholder ridges are replaced by three eroded alpine ranges and a
far ring. A summit massif stands behind the lodge: a main summit with a short
summit ridge and sharp aretes, a secondary peak, and a lower shoulder across a
saddle, with faces topping out around 50 to 55 degrees (thermal talus 56). A
lower front range sits between it and the basin; a low-frequency envelope sinks
parts of it to saddles and raises others into groups of two or three peaks. A
south range closes the reverse view: a serrated wall with three summits, aretes and couloirs between them, and a lower foreground shoulder. Rock bedding is domain-warped with a dip that drifts across the ranges, varies between massive and thinly bedded faces, and fades beyond about 150 m. All of it stays inside 420 m. The near ranges
are each under 50k triangles and the far ring is under 10k. The basin, lodge,
court, pond, paths and trees are unchanged.

Rebuild from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' --background --factory-startup --threads 8 --python scripts/build-winter-mountains.py
node scripts/optimize-winter-bluehour.mjs
```

`scripts/build-winter-mountains.py` opens the committed `.blend`, deletes every
object whose `bluehourRole` is `mountain`, builds new meshes from deterministic
noise and thermal erosion, saves the `.blend`, and runs the shared exporter. It
also writes each range as a 16-bit heightfield to
`blender/winter/mountain-heightfields/` with a `manifest.json` (center, size,
height scale, rotation) for the Unreal port. The far ring is stored in polar
layout. The vertex colors carry ridge convexity, exposure and scree for the
runtime material.

The mountains use two materials of their own, "Alpine massif rock" and
"Distant blue range", rather than the shared granite. This keeps the runtime
mountain shader off the lodge plinth, benches and boulders, and the exporter
keeps the near and far meshes separate so the low tier can drop the far ring.

`winter-mountain-material.ts` draws snow cover, rock strata, the moonlit rim and
the blue shadow side in the shader. Near faces get noise-warped ledges by
altitude with exposed rock bands under them, fall-line rock ribs with snow in
the gullies between, and a bumped normal that reads at 100 to 200 m. Snow stays
on low-angle and lee slopes. The rim is a thin cold line on high crest edges
plus a faint moon-facing lift on summit snow. It also adds aerial perspective in layers,
so the mountains turn `fog` off and ignore the scene fog. The quality tiers
choose the noise octaves: low uses one, hides the far ring and skips the relief
detail on near faces; medium uses two and high uses three.

## Asset provenance

- Lodge, interior, court, paths, furniture, lanterns and terrain: original
  geometry authored in Blender for this project.
- Mountain ranges and far ring: original procedural geometry generated by
  `scripts/build-winter-mountains.py`. No downloads or generation services.
- Four conifer families: the project's previously shipped Meshy Winter trees,
  reused from `blender/winter_environment.blend`. Their source prompts and task
  records remain in `scripts/winter-meshy-assets.json`,
  `scripts/winter-tree-layout.json`, and the prior Winter asset records. No new
  generation service, purchase or model download was used.
- Boulder geometry: the previously shipped Poly Haven `boulder_01` and `rock_07`
  scans (CC0), with a new shared granite material.
- Snow surface: the existing ambientCG Snow004 CC0 texture set. The source
  archive and checksum are recorded in `scripts/fetch-winter-environment-assets.mjs`.
- Ice and moon textures: unchanged project assets used by the existing runtime.

## Verification

Focused tests cover the canonical foot plane through cast growth, retained scene
resources, reduced motion, and shared renderer ownership. The production renderer
is the visual authority; Blender renders are authoring evidence. Runtime captures
record arrival, walking, reverse, shore, wide views, the supported viewport matrix,
and real performer casts. See `blue-hour-lodge-verification.json` for the delivered
build's observations and their limits.
