# Unified Meters Scale System

**Repository status (2026-10-14):** `src/lib/shared/3d/physics/player-controller.ts` imports `SCALE` from `@austencloud/scene-3d`. Camera values live in `packages/camera-3d/src/lib/constants.ts`; `src/lib/shared/3d/domain/constants/plane-transforms.ts` retains meter units and `GRID_RADIUS_3D = 0.52`. The old `3d-core` and `realm` entries below are historical.

## Historical status: January migration recorded complete

> **Note (Jan 2026):** Paths referencing `infinite-worlds/` have been renamed to `realm/`.

The January migration adopted **1 unit = 1 meter**. The conversion table below records that migration; it is not a current file-owner inventory.

## Historical local scale definition

Historical owner (now absent): `src/lib/shared/3d-core/scale/scale-constants.ts`.

```typescript
export const SCALE = {
  // Player dimensions (meters)
  PLAYER_HEIGHT: 1.7,
  PLAYER_WIDTH: 0.4,
  EYE_HEIGHT: 1.6,
  PLAYER_RADIUS: 0.3,

  // Movement speeds (m/s)
  WALK_SPEED: 3.5,
  RUN_SPEED: 7.0,
  SPRINT_SPEED: 10.0,
  SPRINT_MULTIPLIER: 2.0,

  // Camera
  DEFAULT_FOV: 75,
  NEAR_CLIP: 0.1,
  FAR_CLIP: 1000,

  // Physics
  GRAVITY: -9.81,
  JUMP_VELOCITY: 5.0,
  TERMINAL_VELOCITY: -50,
  MOUSE_SENSITIVITY: 0.002,
  ROTATION_SMOOTHING: 8,
};
```

## What Was Converted

### Movement & Camera (Phase 1)

| File                                                    | Changes                             |
| ------------------------------------------------------- | ----------------------------------- |
| `realm/core/systems.ts`                                 | Uses SCALE.\* for movement, gravity |
| `gallery/components/navigation/ModelFirstPerson.svelte` | Uses SCALE.\* for player dimensions |
| `3d-animation/state/avatar-instance-state.svelte.ts`    | Scene bounds now in meters          |
| `3d-core/camera/UnifiedCameraController.svelte`         | All SETTINGS in meters              |
| `3d-core/camera/types.ts`                               | DEFAULT_CAMERA_CONFIG in meters     |

### Geometry (Phase 2)

| File                    | Changes                                            |
| ----------------------- | -------------------------------------------------- |
| `avatar-proportions.ts` | `CM_TO_UNITS = 0.01` (cm→meters), `figureZ = -0.4` |
| `user-proportions.ts`   | Grid padding now `0.25` meters                     |
| `grid-layout.ts`        | Point sizes in meters (0.04, 0.025, 0.08)          |
| `formation.ts`          | Spacing = 2.0m, wall offset = -0.3m                |

### Environment Scenes (Phase 3)

| File                        | Key Conversions                                   |
| --------------------------- | ------------------------------------------------- |
| `ForestScene.svelte`        | Tree rings 10-20.5m, clearing 10m, campfire at 3m |
| `OceanScene.svelte`         | Ground 15m radius, bubbles 3m area                |
| `WinterScene.svelte`        | Ground 15m radius, snow 4m area                   |
| `SakuraScene.svelte`        | Ground 15m radius, petals 3.5m area               |
| `CherryBlossomScene.svelte` | Ground 15m radius, petals 3.5m area               |
| `EmberScene.svelte`         | Ground 15m radius, embers 3m area                 |
| `CosmicScene.svelte`        | Asteroid 1.25m radius, stars 7.5m area            |

### Environment Primitives

| File                         | Changes                                           |
| ---------------------------- | ------------------------------------------------- |
| `GroundPlane.svelte`         | Default size 25m radius                           |
| `TexturedGroundPlane.svelte` | Default size 25m radius                           |
| `FallingParticles.svelte`    | Physics values in m/s, shader point scale updated |
| `ScatteredModels.svelte`     | Default area 2m, minDistance 0.4m                 |

## Key Conversions

| Old Value                | New Value            | Meaning                     |
| ------------------------ | -------------------- | --------------------------- |
| `CM_TO_UNITS = 2`        | `CM_TO_UNITS = 0.01` | 1 cm = 0.01 meters          |
| `distance: 250`          | `distance: 3.0`      | 3 meters camera distance    |
| `height: 120`            | `height: 2.0`        | 2 meters camera height      |
| `firstPerson.height: 85` | `SCALE.EYE_HEIGHT`   | 1.6 meters                  |
| `FORMATION_SPACING: 400` | `2.0`                | 2 meters between performers |
| `figureZ: -80`           | `figureZ: -0.4`      | 40cm behind grid            |
| `gridPadding: 50`        | `0.25`               | 25cm padding                |

## Design Principles

1. **1 unit = 1 meter** - Simple mental model
2. **All constants in one place** - `scale-constants.ts` is the truth
3. **Physics-compatible** - Rapier expects meters, now everything matches
4. **Consistent feel** - Walking at 3.5 m/s feels the same everywhere

## Testing Checklist

After these changes, verify:

- [x] TypeScript compiles without errors
- [x] Svelte-check passes
- [ ] Stage avatar appears at correct scale
- [ ] Stage camera distances feel natural
- [ ] Gallery movement matches Stage
- [ ] Infinite Worlds movement matches
- [ ] Props appear at correct grid positions
- [ ] Formations space performers correctly

## LEGACY_CONVERSION

The `LEGACY_CONVERSION` export is deprecated but kept for historical reference:

```typescript
// @deprecated - All code now uses meters
export const LEGACY_CONVERSION = {
  STAGE_TO_METERS: 0.005, // Old: 1 unit = 0.5cm
  METERS_TO_STAGE: 200, // Old: 200 units = 1 meter
};
```

No code should use this anymore.
