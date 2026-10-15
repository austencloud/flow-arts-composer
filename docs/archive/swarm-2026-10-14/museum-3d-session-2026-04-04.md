# Museum 3D Session — 2026-04-04/05

## What Was Built

### Root Motion Infrastructure (disabled, preserved for future A/B testing)
- `src/lib/shared/3d/services/contracts/IRootMotionExtractor.ts` — contract
- `src/lib/shared/3d/services/implementations/RootMotionExtractor.ts` — extracts Hips XZ delta per frame
- LocomotionAnimator modified: `enableRootMotion` config flag, keeps Hips position track for walk clips
- MuseumPhysicsProvider: `rootMotionEnabled` flag + `applyRootMotion()` method
- Avatar3D: `enableRootMotion` prop, `onRootMotion` callback, RootMotionExtractor wiring
- Root motion animations downloaded (In Place OFF) at `static/animations/locomotion-pack/*-rm.glb`
- **Currently disabled** (`enableRootMotion={false}`) — user prefers responsive code-driven controls
- To re-enable: set `enableRootMotion={true}` on Avatar3D + `physicsProvider.rootMotionEnabled = fpsActive`

### Coordinate Discovery (Mixamo FBX→GLB via Blender)
- X = lateral (left/right)
- Y = forward/backward (root motion axis)
- Z = absolute hip height (~-100cm in Mixamo units)
- This swizzle is baked into the Blender FBX→GLB conversion

### Shadows
- `PCFSoftShadowMap` enabled on renderer
- Avatar meshes: `castShadow = true` (set in Avatar3D after model load)
- GLTF prop meshes: `castShadow = true` (set in GltfProp3D after clone)
- Floor meshes: `receiveShadow`
- Wall meshes: `castShadow` + `receiveShadow`
- Pedestals, signs, furniture: `castShadow` + `receiveShadow`
- Dynamic point/spot light shadows **disabled** — toggling `castShadow` reactively causes Three.js `deallocateRenderTarget` crashes + exceeds WebGL's 16 texture unit limit
- No invisible overhead light — all lighting from real sources (torches, exhibit spots, ceiling)

### Camera Collision (Spring Arm)
- Matches ecctrl/Unreal spring arm pattern
- Single ray from player to desired camera position
- Only collides with wall meshes tagged `userData.cameraCollider = true`
- Time-based exponential decay lerp (framerate independent)
- `CAMERA_PULL_IN_SPEED = 10` (fast), `CAMERA_RECOVERY_SPEED = 3` (smooth drift out)
- Fixed `scene.current` → `(scene as any)?.current ?? scene` for Threlte 8.x compatibility
- Face normal filter: skips floor/ceiling (|normal.y| > 0.7), properly transforms to world space

### Scroll-to-Zoom (Third Person)
- Default distance: 5.0m (was 3.0m)
- Scroll wheel zooms between 1.5m and 10.0m
- `desiredDistance` state variable replaces hardcoded `cfg.distance`
- Zoom speed: 0.5m per scroll tick

### Room Scaling
- `ROOM_SCALE = 1.5` in `computeRoomDimensions()` (`wall-segment-types.ts`)
- All rooms 50% larger proportionally
- Grid cache invalidated via `layoutVersion` in hash
- **Next session: performance optimization needed** — 1.5x scale = 2.25x more tiles

### Ceiling Lights
- Reduced from intensity=4/distance=16/decay=1 to intensity=2.5/distance=12/decay=1.5
- Entrance lobby was absurdly bright

### Locomotion Audit Findings (from code-reviewer agent)
Issues identified but not all fixed:
1. ✅ First-person stuck (Avatar3D unmounting) — reverted since root motion disabled
2. ✅ Diagonal movement fix — reverted since root motion disabled
3. ✅ Stale velocity in root motion mode — fixed in MuseumPhysicsProvider
4. ✅ Walk vertical bob — Z values made relative instead of zeroed
5. ✅ Debug logs removed
6. ⬜ cm-to-scene conversion hardcodes 170cm (should detect from skeleton)
7. ⬜ Avatar3D is a god component (788 lines)
8. ⬜ Root motion split across 5 files with no coordinator

## Performance TODO (Next Session)
The 1.5x room scale makes the museum feel spacious but strains loading:
- **Frustum culling** — only render what's in the camera viewport
- **LOD (Level of Detail)** — simpler geometry for distant objects
- **Chunked/streaming loading** — load rooms on demand as player approaches
- **InstancedMesh optimization** — already used for floors/walls, but 2.25x more instances
- **Visibility octree** — spatial partitioning for fast culling
- **2D→3D transition** — the dimension flip is slow, may need to keep 3D scene warm

## Files Modified This Session
- `src/lib/shared/3d/services/implementations/LocomotionAnimator.ts`
- `src/lib/shared/3d/services/implementations/RootMotionExtractor.ts` (NEW)
- `src/lib/shared/3d/services/contracts/IRootMotionExtractor.ts` (NEW)
- `src/lib/shared/3d/services/contracts/ILocomotionAnimator.ts`
- `src/lib/shared/3d/components/Avatar3D.svelte`
- `src/lib/shared/3d/components/props/GltfProp3D.svelte`
- `src/lib/shared/3d/camera/UnifiedCameraController.svelte`
- `src/lib/shared/3d/camera/types.ts`
- `src/lib/features/museum/components/game/Museum3DScene.svelte`
- `src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte`
- `src/lib/features/museum/components/game/MuseumTorch3D.svelte`
- `src/lib/features/museum/components/game/MuseumFurniture.svelte`
- `src/lib/features/museum/services/implementations/MuseumPhysicsProvider.ts`
- `src/lib/features/museum/domain/wall-segment-types.ts`
- `src/lib/features/museum/MuseumModule.svelte`
- `static/animations/locomotion-pack/*-rm.fbx` and `*-rm.glb` (NEW)
- `static/animations/locomotion-pack/convert-rm.py` (NEW)
