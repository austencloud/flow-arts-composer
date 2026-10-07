---
status: active
value: null
effort: null
remaining: "Verify autumn composition bounds, quiet zone, fixed gust envelope, and visual scene acceptance against current runtime."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Living Autumn Clearing

## Outcome

Replace Autumn's generic gradient-and-confetti treatment with a painted grove after rainfall. Rain-dark trunks frame an amber clearing, distant trees dissolve into haze, and restrained leaves enter from the canopy edges. The central field stays visually quiet so application content remains legible.

## Authored source material

The grove uses original ChatGPT-generated wide and portrait art split into far, middle, and near plates under `static/images/backgrounds/autumn/`. The far plate is an opaque clearing. The middle and near plates use WebP alpha so trunks, leaf banks, and canopy edges can travel independently over it. Canvas selects one aspect-specific set and owns responsive cover cropping, depth movement, light, mist, color grading, and the animated leaf layer.

The original wide and portrait mattes remain the low-quality fallback. They are not used to imitate depth; they provide a complete still composition when the multiplane treatment is disabled.

Autumn does not use random species selection, procedural tree generation, `BareTree`, or Perlin noise. Existing Forest silhouettes remain available references, not a creative constraint.

## Composition

All positions use normalized scene coordinates and are resolved for the active aspect ratio.

- Rain-dark trunks and partial canopy hold the extreme edges.
- Distant vertical trunks recede through warm mist instead of forming a black silhouette wall.
- A wet forest floor catches broken amber reflections near the lower edge.
- There is no moon, owl, pond badge, or Halloween iconography.
- Leaf release zones align with the canopy edges. Respawned leaves enter from those zones instead of the full top edge.

The central quiet zone spans roughly the middle 40 percent of the scene width and the middle 55 percent of its height. Hero silhouettes may frame this zone but must not fill it.

## Motion and interaction

- Pointer movement drives one shared, eased viewpoint. The far plate barely shifts, the middle grove travels farther, and the close frame travels farthest.
- Every plate is cover-cropped with enough overscan for its maximum depth offset so motion cannot expose an edge.
- Leaves use a continuous breeze plus a fixed-duration eased gust envelope. No noise field is involved.
- Wind presets alter real motion parameters. Density presets alter the real particle count.
- Reduced motion freezes parallax and decorative animation while preserving the complete composed frame.
- Touch receives the composed scene without hover-dependent behavior.

## Implementation scope

Shared backgrounds package:

- Add an Autumn composition geometry module with tests for bounds and the quiet zone.
- Extract the Winter pointer-depth behavior into one shared depth-parallax tracker, then use that owner for Winter snow and Autumn art planes.
- Add an Autumn scenery renderer that loads one wide or portrait plate set, cover-crops each plane for its full travel, and applies the restrained light, mist, and grade treatments.
- Rework Autumn leaf spawning and wind behavior around authored release zones and real presets.
- Integrate the scene, accessibility, pointer input, and layer visibility in `AutumnBackgroundSystem`.

TKA application:

- Wire Autumn Lab controls to the actual system capabilities.
- Forward preview pointer coordinates through the existing lab canvas shell if needed.

No package publishing is part of this implementation while the shared package checkout contains unrelated uncommitted work. Local package output may be injected temporarily for visual verification and then restored.

## Risks and mitigations

- **4K memory pressure:** decode only the active aspect's source plates and flat fallback. Do not allocate a stack of viewport-sized offscreen canvases.
- **Asset loading:** retain the warm base fill or flat fallback until the aspect-appropriate far plate resolves.
- **Content competition:** test every required viewport with the Lab chrome visible and preserve the central quiet zone.
- **Shared worktrees:** edit only Autumn files and the explicitly identified TKA integration files. Do not stage, revert, or publish unrelated changes.

## Verification

- Focused unit tests cover composition bounds, the quiet zone, and the fixed gust envelope.
- Run focused package tests and package type/build checks.
- Run focused TKA checks for modified application files.
- Visually inspect the Autumn Lab at 1920×1080, 2560×1440, 3840×2160, 1440×900, 820×1180, 960×412, and 375×667.
- At one desktop viewport, verify density, wind, gust, layer visibility, pointer parallax, and reduced-motion behavior.
- Check the browser console for errors before restoring any temporary local package injection.
