---
status: backlog
value: null
effort: null
work_state: unverified
remaining: Audit current scene startup path, then implement the demand-loaded effects and cooperative warming acceptance if absent.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# 3D Scene Zero-Jank Startup

**Status:** Backlog
**Date:** 2026-08-30
**Owners:** `Viewer3DCanvas`, `Viewer3DScene`, `SceneEffectsManager3D`, and the existing scene-control workspace

> Retirement note (2026-09-03): later startup work partially addressed this design, but the demand-loaded effect-manager architecture and its performance acceptance contract have not been verified on `main`. The original worktree was retired and this specification was retained as the canonical backlog record.

## Outcome

Opening the shared 3D viewer must remain responsive while the environment, performers, effects, and editing controls become ready. The initial curtain is allowed to cover incomplete WebGL content, but it is not allowed to mask a frozen main thread. Once the curtain leaves, selecting an effect must not pay the cost of importing every other effect or allocating every pooled renderer.

## Measured Baseline

The production shared viewer was profiled at 1920x1080 on `/test/viewer-3d?scene=blossom` with a foreground Chrome DevTools trace and a pre-document `requestAnimationFrame`, Long Animation Frame, and long-task observer.

- First 300 foreground frames: p50 16.7 ms, p95 33.4 ms, p99 266.6 ms.
- Maximum frame gap: 283.4 ms.
- 19 frames exceeded 33.3 ms; 12 exceeded 50 ms.
- Long animation frames reached 303.1 ms, with animation-frame work of 229.3 ms and 275.2 ms during scene/effect startup.
- The scene-control workspace produced a separate 223 ms startup frame because its closed inspector, save modal, and compact controls were in the initial static module graph.
- `SceneEffectsManager3D.initialize()` allocated every pooled effect regardless of the selected effect: 19 scene children on WebGL1, 20 on WebGL2, and approximately 12.21 MB of CPU-side typed arrays before GPU upload.
- A cold TypeScript import of that eager manager graph measured approximately 230 ms. Synthetic construction alone measured 7.6 ms, with Silk contributing approximately 4.74 MB of the eager typed-array allocation.

The raw baseline trace was retained outside the repository at `C:\Users\Austen\AppData\Local\Temp\tka-3d-baseline-trace.json.gz` when this design was written.

## Architecture

### Demand-loaded pooled effects

`SceneEffectsManager3D` remains the sole owner of scene-batched effect renderers. Its static renderer imports are replaced by a typed loader registry. The manager records the scene and renderer synchronously, but imports and constructs only effects required by the current scene assignments or observed rig sources.

Each effect slot moves through `unloaded -> loading-module -> module-ready -> initializing -> compiling -> ready`, with `error` treated as settled and reported. A slot owns an unattached `THREE.Group`. The renderer initializes into that group, `WebGLRenderer.compileAsync(group, camera, scene)` warms its materials, and only then does the manager attach the group to the live scene. This prevents the normal render pass from racing the warmup and forcing a synchronous first-use compile.

Loaded renderers stay resident for the scene lifetime so switching back to an effect is instant. Unselected renderers never allocate their pools.

### Cooperative module warming

Active effects use user-visible task priority. After the first scene reveal, the manager may import the remaining renderer modules one at a time at background priority. It yields between modules, supports `AbortSignal`, and cancels background work when an active effect needs promotion or the scene is destroyed. Background warming imports code only; it does not construct renderers or allocate GPU resources.

The scheduler uses the Prioritized Task Scheduling API when available, `requestIdleCallback` for background fallback, and a task-boundary fallback elsewhere. OffscreenCanvas is not introduced: moving only the effects is not a valid ownership split because Three.js objects and GPU resources belong to the renderer context. Moving WebGL to a worker would require migrating the entire renderer plus an input/state proxy, which is a separate architecture.

### Reveal readiness

`Viewer3DScene` publishes the pooled effects required by the current performers before their orchestrators finish mounting. The manager reports settled progress for those effects. `Viewer3DCanvas` combines effect settlement with environment, performer, and shader readiness; gated playback and the loading curtain release only after the active effect group has initialized and compiled.

Streaming hosts keep their immediate-canvas behavior, but the same demand loading and cooperative task boundaries apply.

### Closed controls stay out of startup

`SceneControlWorkspace` keeps its rail and performer spine as the visible desktop shell. Compact controls, the inspector, and the save modal load only when their existing state branches open. This preserves one control owner and the current motion/layout behavior while removing closed tools from the scene-startup module graph.

## Scope

Primary implementation paths:

- `src/lib/shared/3d/effects/scene-effects/scene-effects-manager-3d.ts`
- `src/lib/shared/3d/effects/scene-effects/scene-effect-task-scheduler-3d.ts`
- `src/lib/shared/3d/effects/scene-effects/SceneEffectsCoordinator3D.svelte`
- `src/lib/shared/3d/components/Viewer3DScene.svelte`
- `src/lib/shared/3d/components/Viewer3DCanvas.svelte`
- `src/lib/shared/3d/components/controls/SceneControlWorkspace.svelte`
- focused unit and source-contract tests under `tests/unit/`

This pass does not move the whole Three.js renderer to OffscreenCanvas, redesign environment assets, or replace adaptive quality. Those remain separate owners and require their own evidence.

## Failure and Cancellation

- A departed or reparented scene invalidates pending renderer work before it can attach a late group.
- A failed renderer reports a settled error so the curtain cannot deadlock. Other effects and the base scene remain usable.
- A requested effect interrupts background warming and receives user-visible scheduling priority.
- Disposal removes and disposes only renderer groups that actually reached initialization.

## Acceptance Contract

- No pooled renderer module is statically imported by the manager.
- Opening a scene with one pooled effect allocates only that renderer; opening with no pooled effect allocates none.
- Closed inspector, compact controls, and save modal are absent from the initial control-workspace module graph.
- The active pooled effect is initialized and shader-warmed before the gated curtain releases.
- Background module warming is sequential, cooperative, and abortable; it never allocates renderer pools.
- A foreground 1080p startup trace has no Long Animation Frame over 50 ms attributable to effect initialization or closed control modules.
- The loading curtain frame cadence is p95 <= 16.7 ms after cold-cache network/module fetch noise is excluded, with no application long task over 50 ms.
- The revealed viewer sustains the existing 60 fps target at 1080p and keeps adaptive resolution active at 4K.

## Verification

1. Focused Vitest coverage proves demand allocation, readiness, shader compilation, background cancellation, and disposal.
2. Source-contract tests prove the static-import and conditional-control boundaries.
3. Project TypeScript/Svelte checks run against the changed paths, followed by the repository's proportionate verification commands.
4. A before/after Chrome DevTools trace repeats the same 1920x1080 Blossom route and observer harness.
5. A gated viewer route confirms that the curtain animates while work proceeds and does not reveal before the active effect settles.
6. A 3840x2160 runtime pass checks sustained rendering and adaptive pixel ratio without resizing the shared browser window.

## Research Basis

- Three.js recommends `WebGLRenderer.compileAsync()` for asynchronous shader compilation through `KHR_parallel_shader_compile`.
- Three.js and MDN document OffscreenCanvas as a whole-renderer transfer rather than a mechanism for sharing one WebGL context between the main thread and a worker.
- The Prioritized Task Scheduling API supplies priority-aware `postTask()` and cooperative `yield()`; feature detection and fallbacks remain required.
