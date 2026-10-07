---
status: active
value: null
effort: null
remaining: "Verify museum single-destination routing, corridor-null behavior, room filtering, and light-pool caps against current code and scene."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Museum Single Destination and Fixed Light Rig

## Outcome

Opening Museum enters the walk directly. Visitor navigation does not expose
the floor-plan editor, prop showroom, or third-party controller experiment.

Walking through a corridor or doorway never changes the number or types of
lights seen by Three.js. Room lighting changes through uniform values on a
small, permanently mounted light rig, so a doorway cannot trigger shader
compilation.

## Navigation

- Museum has no child sections. The module is the destination.
- The 2D editor and its isolated state tree are removed.
- The obsolete `three-player-controller` experiment and dependency are removed.
- The existing props showroom remains available at `/test/museum-showroom` for
  asset review. It owns the only Museum-related canvas on that route.
- Old `/museum/*` links continue to open Museum because sectionless modules
  ignore stale child segments.

## Lighting

The existing `museum-room-light-pool.ts` becomes the canonical point-light
budget for the Museum.

- Generated room fill keeps two permanent point-light slots.
- Authored cave lighting gets three permanent point-light slots.
- Authored grayboxes publish light candidates; they do not mount point lights.
- The nearest candidates for the current lighting room fill the authored slots.
- Corridors retain the last occupied room as their lighting context instead of
  treating `null` as permission to enable every room.
- Slot position, color, range, and intensity blend over time. Slot count never
  changes.
- The Sun and Moon directional and hemisphere lights remain mounted and change
  intensity only. Their light types therefore stay in the compiled program.

## Existing Primitives

- Extend `src/lib/features/museum/services/museum-room-light-pool.ts` for the
  bounded authored-light selection and interpolation.
- Reuse the SvelteKit test-route pattern used by `/test/theme-showroom`.
- No new state service or UI primitive is introduced.

## Verification

- Pure tests cover corridor-null behavior, room filtering, nearest-light caps,
  fixed slot counts, and interpolation.
- Source contracts reject conditional visibility around Museum light objects.
- Museum navigation has no child sections and no mode persistence.
- A Chrome performance trace covers entrance, first corridor, cave threshold,
  squeeze, and flooded approach. No shader compilation may occur after the
  loading gate, and no transition task may exceed 50 ms.
- Screenshots cover the entrance, corridor, and threshold at the required
  desktop, 4K, tablet, foldable, and phone viewports.
