---
status: active
value: null
effort: null
remaining: "Verify feather-rib silhouette, performer lane clearance, and runtime budget from default camera in current celestial scene."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Seraphic Vault Celestial Environment

**Date:** 2026-08-09  
**Status:** Approved for production  
**Steward:** Seraph  
**Internal background ID:** `celestial`

## Approved target

The approved visual target is
`assets/meshy-refs/celestial/concept/seraphic-vault-approved.png`.

Seraphic Vault is defined by four materials and phenomena: carved feather
stone, cool cloud shadow, warm sunlight, and open sky. It must not inherit the
gardens, trees, seasonal foliage, classical columns, coral, stars, or ruins that
identify other environments.

## Composition contract

- A broad irregular alabaster performance floor remains clear at the center.
- Three distinct feather-rib families frame the view in mirrored pairs.
- The outer pair provides the hero silhouette. The middle and inner pairs step
  down toward the sun without forming a uniform tunnel.
- Cloud banks hide the platform edge and the bases of the ribs.
- The sun sits beyond the stage, slightly above the horizon, and reads through
  the ribs instead of washing across the performer floor.
- The lower third and rib interiors remain cooler and darker than the sky so
  pale props, trails, and interface chrome retain contrast.
- Hanging iridescence is optional and must stay outside the central performer
  lane. It cannot become a second focal point.

## Ownership

- `CelestialScene.svelte` remains the production scene assembler.
- `Environment3D.svelte` remains the only environment selection, transition,
  and stage-alignment owner. This project does not duplicate that behavior.
- Static floor and feather-rib geometry is authored in Blender and exported as
  one optimized GLB.
- Runtime cloud motion, sunlight, motes, fog, and quality adaptation remain in
  the existing Threlte environment pipeline.
- The in-flight 2D `CelestialBackgroundSystem.ts` rewrite in
  `E:/shared-packages` remains untouched by this production pass.

## Paid asset contract

Meshy image-to-3D receives three isolated references from
`assets/meshy-refs/celestial/`. Each paid task must be checkpointed before
polling or download. The batch cap is 90 credits. The live pre-submit balance
was 620 credits.

| Asset               | Authored height | Purpose                           |
| ------------------- | --------------: | --------------------------------- |
| Outer Feather Rib   |            14 m | Hero frame and primary silhouette |
| Middle Feather Rib  |            10 m | Depth and rhythm                  |
| Inner Feather Spire |             7 m | Sun framing and sightline closure |

## Runtime budget

- One optimized environment GLB with Meshopt compression and WebP textures.
- Static ribs are reused as mirrored instances in Blender, not loaded as six
  separate network assets.
- The highest quality tier may render all atmosphere layers. Lower tiers reduce
  cloud and mote density before removing the authored silhouette.
- The playable surface stays at native local Y `0.01`, preserving the existing
  shared stage-coordinate contract.

## Acceptance

- The approved feather-rib silhouette is recognizable from the default camera.
- The performer lane is unobstructed and visually distinct from the horizon.
- Light-colored props and trails remain legible against the lower third.
- No obvious repeated-copy pattern is visible across the three rib families.
- The GLB passes structural, triangle, texture, and bounds verification.
- Scene readiness waits for the GLB and does not time out under ordinary load.
- Browser proof covers 1920x1080, 2560x1440, 3840x2160, 1440x900,
  820x1180, 960x412, and 375x667 with no console or WebGL errors.
