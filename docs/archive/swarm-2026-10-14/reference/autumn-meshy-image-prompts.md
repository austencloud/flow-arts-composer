# Enchanted Autumn Dusk — ChatGPT → Meshy Concept-Art Prompts

The low-poly CC0 kit reads mathematical. This is the lifelike path: tune concept art
in ChatGPT, then drive Meshy **image-to-3D** from the images you love.

## Workflow

1. Paste a prompt below into ChatGPT (image generation). Iterate until you love it.
2. Save the chosen image(s) into the matching folder: `assets/meshy-refs/autumn/<id>/`.
   - **1 image** → Meshy single `image-to-3d`.
   - **2–4 images** (same subject, different angles) → Meshy `multi-image-to-3d` → much
     better geometry (it stops guessing the hidden side). Best for the hero trees.
3. Generate: `node scripts/generate-autumn-meshy-from-image.mjs` (or `--only hero-tree-a`).
4. Optimize: `node scripts/optimize-autumn-meshy.mjs --manifest scripts/autumn-meshy-images.json`.
5. The optimized `static/models/autumn/<id>.glb` is picked up by the scene.

## Meshy-friendly framing — append to EVERY image prompt

Meshy reconstructs best from a clean subject. Tell ChatGPT, every time:

> Single subject, centered, entire object fully visible with nothing cropped at the
> edges. Plain neutral mid-grey background, no scenery, no ground shadow merging into
> the subject. Even soft diffuse studio lighting (no hard directional shadows, no strong
> colored rim light baked in — we relight in-engine). 3/4 view, slightly above eye level.
> Photoreal, high detail. No text, no watermark, no border.

For **multi-image** assets, generate the **same** subject from: front, front-3/4 (≈45°),
side, and (optional) back — keep proportions, colors, and details identical across views.

> Note on glow: do NOT bake strong emissive bloom into the concept image — keep the
> mushrooms/leaves only *slightly* luminous. The engine drives the real glow + pulse via
> an emissive override, so a blown-out glowing image makes a worse 3D texture.

---

## Hero assets

### `hero-tree-a` — gnarled ancient oak (MULTI-IMAGE recommended)
> A massive ancient gnarled oak tree, photoreal. Thick twisting trunk with deep bark
> crevices and knotholes, heavy exposed gnardled roots gripping the soil, a few broken
> limbs. Sprawling canopy of dense crimson-and-gold autumn leaves, patches of moss and
> lichen on the north side. Storybook-fantasy but lifelike, slightly oversized and
> characterful. Late-autumn, just past peak.

### `hero-tree-b` — twisted leaning maple (MULTI-IMAGE recommended)
> An old wind-twisted maple tree, photoreal. Leaning, sinewy trunk with peeling weathered
> bark and burls, a hollow at the base. Broad asymmetric canopy of amber, rust, and deep
> red leaves, thinning to bare branches at the crown. Mossy roots, a scatter of clinging
> dead leaves. Lifelike, gnarly, characterful.

### `mushroom-grove` — lifelike bioluminescent cluster
> A dense cluster of large fantasy forest mushrooms growing from a mossy mound, photoreal.
> Varied organic caps — some broad and domed, some tall and slender — in muted teal and
> dusty violet, with delicate vein-lit gills faintly luminous (subtle, not glowing).
> Damp realistic stems, moss, a few fallen leaves at the base. Lifelike, slightly
> oversized, magical but grounded.

---

## Fill / set-dressing (replace the low-poly kit)

### `mossy-boulder` — gnarly mossy rock
> A large weathered granite boulder, photoreal, thickly carpeted in deep green moss and
> grey-green lichen, damp surface, cracks and mineral veins. A few autumn leaves caught on
> top. Lifelike forest-floor rock.

### `fallen-log` — gnarled mossy log
> A fallen, half-rotted tree log, photoreal. Peeling bark, splintered broken end, soft
> moss along the top, small bracket fungi and toadstools growing from the side, damp dark
> wood. Lifelike, characterful, gnarly.

### `fern-clump` — lush undergrowth
> A lush clump of forest ferns, photoreal, deep green arching fronds of varied lengths
> springing from a mossy base, a few fronds tinged autumn-yellow. Dense, lifelike
> undergrowth.

### `terrain-shell` — forest floor (single image, top-down-ish)
> A circular patch of autumn forest floor terrain seen from a high 3/4 angle, photoreal.
> Gentle uneven mounds, a shallow depression on one side for a pond, a thick litter of
> fallen crimson and gold leaves, damp dark soil, exposed roots and a few half-buried
> stones, scattered moss. Lifelike, no trees on it (just the ground).

---

## Scope / credits

Each asset is Meshy credits + a few minutes. Suggested priority order if trimming:
1. `hero-tree-a`, `hero-tree-b` (the silhouette that sells the scene) — multi-image.
2. `mushroom-grove` (the magic).
3. `mossy-boulder`, `fallen-log`, `fern-clump` (kill the low-poly kit reads).
4. `terrain-shell` (or keep a Meshy/heightmap ground — lowest priority).

## Follow-up wiring (after assets exist)
Once the lifelike GLBs land in `static/models/autumn/`, `AutumnFlora.svelte`'s kit model
list (currently `/models/vegetation/*`) gets swapped to instance the new `/models/autumn/*`
assets. Hero trees mount in the orchestrator; boulders/logs/ferns/mushrooms instance via
the existing `ringPlacements`. That swap is a code change tracked separately — flag when
the first batch is generated.
