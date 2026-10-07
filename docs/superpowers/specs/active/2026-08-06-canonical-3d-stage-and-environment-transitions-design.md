---
status: active
value: null
effort: null
remaining: "Verify Canonical 3D Stage and Environment Transitions against src/lib/shared/3d/environments/domain/stage-coordinate-frame.ts before resuming implementation. Prior recorded remainder: Verify protected performer anchors and environment transition acceptance across each supported 3D scene before continuing the revision."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Canonical 3D Stage and Environment Transitions

**Date:** 2026-08-06  
**Status:** Protected-performer transition revision in progress

## Outcome

Changing the 3D environment must not move the performers, their props, their
selection markers, or the camera frame. Every environment aligns its playable
surface to one performance anchor. The environment leaves and arrives around
performers whose animation continues without interruption.

## Confirmed cause

`Viewer3DScene.svelte` currently derives the performer rig offset from the
selected background. Ocean uses 2.5 world units when its ruins stage is on.
The other environments use values between 0 and 0.55. That value reaches the
performer rig, camera presets, badges, lights, and floor markers, so selecting
Ocean visibly raises the whole performance.

The scene graph already has the right ownership boundary:

```text
Viewer3DScene
  Environment3D       replaced when the background changes
  Performer group     remains mounted
  Camera              remains mounted
```

The environment switcher currently clears scene-global fog, background, and
environment state, renders a blank frame, then mounts the next environment.
The first-load curtain deliberately never returns for later scene changes.

## Coordinate-frame contract

`STAGE.STAGE_DECK_HEIGHT` is the canonical performer rig anchor. At the default
body proportions, the performer's feet therefore land at:

```text
userProportionsState.groundY + STAGE.STAGE_DECK_HEIGHT
```

The performer anchor never depends on `BackgroundType` or on the stage feature
toggle. Turning a platform on or off is an environment change, not a performer
translation.

Each environment retains its authored local coordinates. One environment-root
translation aligns the active walking surface to the canonical anchor:

```text
environmentYOffset = canonicalAnchorY - nativeSurfaceY
```

| Environment      | Native surface Y | Root translation |
| ---------------- | ---------------: | ---------------: |
| Forest           |             0.55 |                0 |
| Autumn           |                0 |            +0.55 |
| Cosmic           |              0.4 |            +0.15 |
| Winter           |             0.45 |            +0.10 |
| Ocean, stage on  |              2.5 |            -1.95 |
| Ocean, stage off |              1.5 |            -0.95 |
| Ember            |              0.5 |            +0.05 |
| Blossom          |             0.35 |            +0.20 |
| Rainbow          |              0.4 |            +0.15 |
| Celestial        |             0.01 |            +0.54 |
| Void             |             0.35 |            +0.20 |

The table replaces the background-specific performer-offset switch. A focused
test must prove `nativeSurfaceY + environmentYOffset` equals the same canonical
anchor for every entry.

### Ocean world-space systems

Ocean has shader and GPGPU systems that compare world-space positions against a
ground reference. A parent transform moves rendered geometry automatically,
but it does not rewrite standalone uniforms or cursor rays. The environment
translation must therefore reach:

- seabed caustic height fading;
- authored-flora sway masking;
- god-ray height normalization;
- cursor-ray coordinates used by the fish compute system.

Local simulation coordinates stay local. Values compared with `modelMatrix`
world positions receive the translated world ground. The cursor origin is
converted back into Ocean-local coordinates before entering the fish compute
shader.

## Transition design

Keep the outgoing environment at its authored size and position. Cover the set
with a short charcoal lighting dip, remove the environment only at the darkest
point, clear scene-global state during one empty environment frame, then mount
the latest requested environment behind the veil. Reveal it after the
environment readiness contract and scene-wide shader warmup both settle.

```text
idle -> covering -> gap -> waiting for readiness -> revealing -> idle
```

The veil is part of the WebGL render pipeline instead of a DOM layer above the
entire canvas. The base scene renders first, the charcoal set veil renders
second, depth is cleared, and the protected performer layer renders last. That
final layer contains every performer rig, both props, performer effects, and
the shared fill lights. The performer therefore remains fully lit while the
set reaches its darkest point.

The transition does not translate, scale, rotate, blur, or distort either
layer. The performer remains mounted at the same world and screen position.
Playback, locomotion, prop animation, camera state, and performer selection
continue through the set teardown and rebuild.

The default cover lasts 200 milliseconds and the reveal lasts 280
milliseconds. The veil peaks at 88 percent opacity so the environment swap is
muted without turning the stage into a full black frame. Viewer controls remain
in the DOM above the canvas. The protected performer pass runs after Ocean
postprocessing and after the ordinary low-tier render path, so its visibility
does not depend on the active composer.

Rapid selections are latest-request-wins. A request made during covering
replaces the pending target. Selecting the still-mounted scene reverses the
cover. A new request during reveal begins covering from the current opacity
instead of jumping to a new endpoint.

The transition uses one scene graph and one mounted environment. Keeping two
heavyweight environments would double draw cost, conflict with scene-global
fog and IBL ownership, and increase Ocean render-target cleanup risk. The
additional render is restricted to the protected performer layer and runs only
while the transition veil is visible. The existing `SceneShaderWarmup` remains
the source of shader-compilation readiness; the reveal waits for its completion
signal.

### Thread-isolation boundary

The current environments are Threlte/Svelte component trees. Their component
construction, procedural geometry, per-frame tasks, WebGL uploads, and the
performer currently share one browser thread and one WebGL context. Fetching a
model asynchronously does not change that ownership.

Literal worker isolation requires a second renderer architecture: an
`OffscreenCanvas` environment renderer owned by a worker behind a transparent
foreground performer canvas. Camera state and environment commands cross a
small message boundary. WebGL resources cannot be shared between those
contexts, so the environment scene implementations must first be extracted
from Svelte components into worker-safe Three modules. This revision does not
claim that a promise or idle callback creates that isolation.

The protected performer pass is the required visual boundary for that later
renderer split. It establishes explicit performer membership now without
duplicating either scene graph.

Reduced motion sets cover and reveal durations to zero while preserving the
clean unmount gap, readiness ordering, and shader-compilation gate.

### Research basis

- [WCAG 2.2 Understanding Success Criterion 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)
  distinguishes opacity changes from spatial motion animation and calls for a
  way to disable non-essential interaction-triggered motion.
- [MDN `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
  identifies large scaling and panning as vestibular triggers. The production
  transition therefore changes opacity only and removes timing when the user
  requests reduced motion.
- [Three.js `WebGLRenderer.compileAsync`](https://threejs.org/docs/pages/WebGLRenderer.html)
  is the renderer-supported readiness primitive for compiling the incoming
  scene before its reveal.
- [Three.js OffscreenCanvas guide](https://threejs.org/manual/en/offscreencanvas.html)
  documents moving rendering, loading, and parsing to a worker and the camera
  and input data that must be proxied across the worker boundary.
- [MDN `OffscreenCanvas`](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
  confirms worker ownership and worker `requestAnimationFrame` support.
- [Three.js multiple-scenes guide](https://threejs.org/manual/en/multiple-scenes.html)
  documents that WebGL resources cannot be shared across contexts, ruling out
  pre-uploading an environment in a worker and attaching it to the existing
  renderer.

## Reuse decision

- **Reusing** `Environment3D.svelte` as the only environment lifecycle owner.
- **Reusing** the existing scene-feature readiness contract.
- **Reusing** `SceneShaderWarmup.svelte` as the reveal gate after the new scene
  reports ready.
- **Extending** `Viewer3DCanvas.svelte` with canvas-scoped transition state.
- **Replacing** the production DOM veil with a transition-only WebGL compositor
  so the performer can render after the set is darkened.
- **Reusing** Threlte's layer plugin for inherited layer membership through the
  performer component tree.
- **Creating** two pure domain modules because no existing module defines the
  stage coordinate frame or the 3D environment transition state machine.
- **Not using** the DOM `Crossfade` primitive. The WebGL scene is heavyweight,
  stateful content, and the required effect keeps one environment mounted at a
  time rather than overlapping two keyed canvas instances.

## Implementation scope

### Coordinate frame

- `src/lib/shared/3d/environments/domain/stage-coordinate-frame.ts`
- `src/lib/shared/3d/components/Viewer3DScene.svelte`
- `src/lib/shared/3d/environments/components/Environment3D.svelte`

### Ocean corrections

- `src/lib/shared/3d/environments/scenes/ocean/OceanScene.svelte`
- `src/lib/shared/3d/environments/scenes/ocean/authored/FloraInstances.svelte`
- `src/lib/shared/3d/environments/scenes/ocean/runtime/OceanRuntimeSystems.svelte`
- `src/lib/shared/3d/environments/scenes/ocean/runtime/atmosphere/GodRayShafts.svelte`
- `src/lib/shared/3d/environments/scenes/ocean/runtime/fauna/FaunaSystem.svelte`
- `src/lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/FishBoids.svelte`

### Transition

- `src/lib/shared/3d/environments/domain/environment-transition.ts`
- `src/lib/shared/3d/environments/state/environment-transition-visual-state.svelte.ts`
- `src/lib/shared/3d/environments/context/environment-transition-visual-context.ts`
- `src/lib/shared/3d/environments/components/Environment3D.svelte`
- `src/lib/shared/3d/environments/components/EnvironmentTransitionVeil.svelte`
- `src/lib/shared/3d/environments/rendering/environment-transition-compositor.ts`
- `src/lib/shared/3d/components/Viewer3DCanvas.svelte`
- `src/lib/shared/3d/components/UnifiedViewerCanvas.svelte`
- `src/lib/shared/3d/components/Viewer3DScene.svelte`
- `src/lib/shared/3d/effects/post-processing/ScenePostProcessing.svelte`
- `src/config/domains.ts`
- `src/routes/test/environment-transition/+page.svelte`

### Tests

- `tests/unit/3d/stage-coordinate-frame.test.ts`
- `tests/unit/3d/environment-transition.test.ts`

## Verification contract

### Automated

- Every supported background resolves to the same performer anchor.
- Ocean stage-on and stage-off frames both preserve the performer anchor.
- The transition passes through cover, gap, readiness wait, and reveal in order.
- Rapid requests mount only the most recent target.
- Reversing an in-flight transition is continuous.
- Veil opacity is clamped and reaches the configured peak only at the swap.
- Reduced-motion timings complete without division or stuck-state errors.
- The compositor restores camera layers, scene globals, and renderer clear
  state after every protected pass.
- Imperatively added performer-effect objects join the protected layer.
- Focused tests and the affected TypeScript/Svelte check are green.

### Runtime

Use the shared Chrome DevTools target and a task-owned tab. Start a sequence,
switch through every environment, and confirm:

- the performer remains at the same screen and world height;
- animation time continues through cover, loading, and reveal;
- the platform or ground meets the feet after each entry;
- Ocean caustics, flora, god rays, and fish remain aligned;
- rapid repeated scene choices settle on the final choice;
- no console or WebGL errors appear;
- renderer memory does not climb after repeated Ocean swaps.

Capture the required viewport matrix because the change affects the visible 3D
surface. Runtime measurements prove transform continuity; screenshots prove
composition.

## Risks and controls

| Risk                                                         | Control                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Ocean shaders retain the old world ground                    | Thread translated ground values explicitly and inspect caustics, flora, and god rays                 |
| Fish scatter compares world rays with local fish coordinates | Subtract the environment root offset from the ray origin before compute                              |
| A late reporter marks the next environment ready             | Unmount the old scene, leave one gap frame, then reset readiness before mounting the next scene      |
| Rapid choices mount intermediate scenes                      | Keep one pending target and replace it until the gap mounts the latest request                       |
| Performer is dimmed with the set                             | Draw the protected performer layer after the WebGL veil                                              |
| Veil is too light to mask the environment swap               | Swap only at peak opacity and keep the one-frame cleanup gap behind it                               |
| First frame of a new environment stalls                      | Keep the veil up until scene readiness and `compileAsync` warmup both settle                         |
| A performer effect is created imperatively after mount       | Refresh protected layer membership on active transition frames                                       |
| Worker preparation is mistaken for shareable GPU state       | Treat a worker environment as its own renderer and context; synchronize camera data only             |
| Long asset loading reads as a stuck screen                   | Keep the performer visible and release on the existing environment error path                        |
| Existing environment edits are overwritten                   | Avoid the dirty scene config, Forest, and Autumn files; recheck status before every overlapping edit |

## Acceptance criteria

- Performer world Y is independent of the selected environment.
- The active environment surface aligns to the canonical performer foot plane.
- Scene changes use a non-spatial set-lighting dip around a fully lit,
  continuously live performer.
- Playback and camera state do not reset during a scene change.
- Ocean world-space effects remain attached to the translated environment.
- Rapid selection, readiness failure, and reduced-motion paths terminate.
- Focused tests, checks, runtime measurements, screenshots, and console output
  provide completion evidence.
