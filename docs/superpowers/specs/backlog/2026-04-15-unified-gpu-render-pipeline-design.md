---
status: backlog
value: 4
effort: L
remaining: Audit current GPU pipeline mounts and default renderer; the earlier phase ledger may no longer match the running app.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Unified GPU Render Pipeline — Design Spec

> **DRIFT WARNING — 2026-08-02.** Phases 0-1 shipped and **live in production by default** (WebGL2 trails); Phase 2 half-built unwired; Phase 3 built then **orphaned** (zero mounts); Phase 4 unused scaffolding
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


## The 10-Year Question

> In 10 years, what will I wish I had done?

Delete the two parallel rendering systems. Merge 2D viewer, 3D viewer, museum, festival sim, and every visual effect (trails, fire, led, charcoal, zap, sparkles, motion, bloom) behind a single GPU-native render graph. Stop storing trails as CPU-side point arrays and iterating them every frame. Stop maintaining two separate canvas stacks with two separate effect pipelines. One rendering authority, one shader vocabulary, one composition model.

This spec is the executable version of that answer.

## Why Now

The immediate trigger is a confirmed performance failure in the sequence viewer:

```
[FPS] 10.0fps over 1100ms (11 frames) | frame: min=50ms max=150ms
render: avg=58ms max=114ms | drops=11 longtasks=872ms | trails=1208 tier=low
```

1208 trail points redrawn per frame via Canvas2D. Render time 58–114ms per frame. `longtasks=872ms` in a 1100ms window — 80% of real time lost to blocking main-thread work. The `tier=low` quality tier was already active and the render budget monitor couldn't claw it back.

Root cause is architectural, not tactical: trails are **O(N)** per frame where N = total points ever recorded. No amount of quality-tier demotion helps if the algorithm itself scales with history length.

Meanwhile three parallel initiatives are converging on the same territory:

- `docs/superpowers/specs/2026-03-25-trail-offscreen-canvas-design.md` — moves trails to a `destination-out` Canvas2D overlay (Tier 1 of the state-of-the-art spectrum)
- `docs/superpowers/specs/2026-04-15-effects-unification-design.md` — consolidates effect intents (trails, fire, led, charcoal, zap, sparkles, motion, bloom) through a single `EffectsConfig` shape with 2D and 3D translators
- `project_tka_village`, `project_festival_simulator`, `project_museum_performance`, `project_animation_layer_system`, `project_led_pattern_engine` — all WebGL-native and growing

The window is now. Every month without this consolidation, the 2D AnimatorCanvas codebase grows, more effects get written twice, and the gap between "2D viewer" and "Threlte scene" widens.

## Goals

1. **Constant-cost trails.** Render cost per frame is independent of trail history length. 32-beat, 320-beat, or 3200-beat — same per-frame budget.
2. **Single render authority.** 2D viewer, 3D viewer, museum, festival sim, Effects Lab, video export — all driven by the same render graph.
3. **Backend-agnostic effects.** An effect intent (`TrailsIntent`, `FireIntent`, …) produces a `RenderPassDescriptor` consumed by whichever backend is active (WebGPU → WebGL2 → Canvas2D legacy fallback).
4. **Zero main-thread trail work.** Trail accumulation, decay, and compositing live on the GPU. Main thread emits segment vertices and nothing else.
5. **Clean export story.** Video export is a serialization of the render graph running at arbitrary resolution. No separate export pipeline.

## Non-Goals

- Rewriting the procedural animation engine. The engine keeps producing per-frame prop poses; only the *rendering* of those poses changes.
- Re-skinning the UI. The `EffectsPanel` and viewer UI stay as they are. Only what's *behind* them changes.
- Multiplayer / server-authoritative rendering. Out of scope.
- Redesigning `EffectsConfig` persistence. The intent shapes from the effects-unification spec are honored verbatim.

## Architecture

### Layer cake (top to bottom)

```
┌──────────────────────────────────────────────────────────────┐
│ UI surfaces: EffectsPanel, Viewer controls, Effects Lab,     │
│ Animation Settings modal, Export drawer                      │
├──────────────────────────────────────────────────────────────┤
│ Intent layer (EXISTS): EffectsConfig, per-effect Intent types│
│ (TrailsIntent, FireIntent, ZapIntent, …)                     │
├──────────────────────────────────────────────────────────────┤
│ NEW: RenderGraph — backend-neutral ordered pass list.        │
│ Translates intents → RenderPassDescriptors.                  │
├──────────────────────────────────────────────────────────────┤
│ NEW: BackendAdapter — WebGPUBackend | WebGL2Backend           │
│ | Canvas2DLegacyBackend. Executes pass descriptors.          │
├──────────────────────────────────────────────────────────────┤
│ Browser GPU (via WebGPU or WebGL2)                           │
└──────────────────────────────────────────────────────────────┘
```

### Core abstractions

```ts
// src/lib/shared/render-graph/domain/RenderPass.ts

/** Backend-neutral render pass description. Produced by translators from intents. */
export interface RenderPassDescriptor {
  /** Stable pass identity for caching shader programs, FBOs, etc. */
  kind: "props" | "grid" | "glyph" | "trail" | "fire" | "led" | "charcoal"
      | "zap" | "sparkles" | "motion" | "bloom" | "composite";

  /** Z-order within the frame. Trails render behind props; bloom renders after composite. */
  order: number;

  /** Which FBO this pass writes to. "scene" = the main scene target. Named targets
   *  enable ping-pong (trail accumulation) and offscreen buffers (fire, led). */
  target: "scene" | "bloom-input" | `trail-${string}` | `custom-${string}`;

  /** Backend-specific payload. Each backend interprets these in its own terms. */
  payload: unknown;

  /** Inputs this pass samples. Enables the graph to insert barriers / dependencies. */
  reads?: string[];
}

/** A single frame's render graph — ordered passes + per-target FBO descriptors. */
export interface FrameGraph {
  passes: RenderPassDescriptor[];
  targets: Record<string, { width: number; height: number; format: "rgba8" | "rgba16f" }>;
}
```

```ts
// src/lib/shared/render-graph/domain/Backend.ts

export interface RenderBackend {
  readonly kind: "webgpu" | "webgl2" | "canvas2d-legacy";

  /** Initialize against a display target. Idempotent. */
  initialize(canvas: HTMLCanvasElement): Promise<void>;

  /** Execute one frame. Callers pass a FrameGraph; backend handles FBO management,
   *  shader compilation, barriers, scheduling. */
  executeFrame(graph: FrameGraph, time: number): void;

  /** Resize all managed FBOs. */
  resize(width: number, height: number): void;

  /** Release GPU resources. */
  dispose(): void;

  /** Diagnostic snapshot for FPS overlay. */
  getStats(): { lastFrameMs: number; longestPassMs: number; fboCount: number };
}
```

### Trail pass — the ping-pong FBO pattern

```ts
// src/lib/shared/render-graph/domain/TrailPass.ts

export interface TrailPassPayload {
  /** Per-tip state. Each tip owns a dedicated FBO pair (ping-pong). */
  tips: Array<{
    tipId: string;                      // stable identity across frames
    newSegments: Segment[];             // vertices added since last frame
    color: [number, number, number, number];
    thickness: number;                  // world units
    decayPerSecond: number;             // 0-1; 1 = instant fade, 0 = no fade
    blendMode: "alpha" | "additive" | "screen";
  }>;
}

export interface Segment {
  from: [number, number];   // NDC or world — backend resolves
  to: [number, number];
  vFrom: [number, number];  // velocity, enables stretch / taper
  vTo: [number, number];
}
```

**Per-frame algorithm inside the backend:**

```
for each tip:
  FBO_read, FBO_write = ping-pong pair
  bind FBO_write
  draw FBO_read into FBO_write via decay shader:
    fragColor = texture(FBO_read, uv) * vec4(1.0, 1.0, 1.0, exp(-decay * dt))
  draw tip.newSegments as line strip with tip.color / tip.thickness
  swap pair

composite phase:
  for each tip: blit FBO_write into scene target with tip.blendMode
```

**Cost per frame:** one full-viewport quad + a handful of line vertices per tip. **Independent of history length.** 1208 points becomes 2–4 points per frame.

### Backend selection

```ts
// src/lib/shared/render-graph/services/implementations/BackendFactory.ts

export async function createBackend(canvas: HTMLCanvasElement): Promise<RenderBackend> {
  if (await isWebGPUAvailable()) return new WebGPUBackend(canvas);
  if (isWebGL2Available()) return new WebGL2Backend(canvas);
  return new Canvas2DLegacyBackend(canvas); // deprecated but available
}

async function isWebGPUAvailable(): Promise<boolean> {
  if (!("gpu" in navigator)) return false;
  try {
    const adapter = await navigator.gpu!.requestAdapter();
    return adapter !== null;
  } catch { return false; }
}
```

Target reach for 2026: WebGPU ships in Chrome 113+ (2023), Edge 113+, Safari 18+ (2024), Firefox behind a flag with a target of mid-2026. WebGL2 ships universally. Canvas2D legacy path exists only to smooth the cutover and gets deleted in Phase 5.

### The 2D viewer becomes an orthographic Threlte scene

Today `AnimatorCanvas` is a parallel rendering universe — its own RAF loop, its own Canvas2D renderer, its own effect stack, zero code share with `Viewer3DCanvas`. After Phase 3, the 2D viewer is a Threlte scene with:

- Orthographic camera fixed along the grid normal
- Props rendered as `PlaneGeometry` with a shader material that draws the 2D prop silhouette (same visual as today's Canvas2D output, produced by a shader reading the prop atlas texture)
- Grid rendered as a textured plane
- Glyphs either as HTML overlays (current behavior) or as baked textures on a plane
- Trails, fire, led, charcoal, zap, sparkles, motion, bloom — all render-graph passes, same intents as 3D

`ViewerSplitPane.svelte` stops mounting two distinct components. Both panes mount the same `UnifiedViewerCanvas`, parameterized by camera mode (`orthographic-2d` | `perspective-3d`).

## Phasing

### Phase 0 — Render graph foundation (2 weeks)

Ship the shell. No user-visible change.

**Build:**
- `src/lib/shared/render-graph/domain/` — `RenderPass.ts`, `Backend.ts`, `FrameGraph.ts`
- `src/lib/shared/render-graph/services/implementations/`:
  - `BackendFactory.ts`
  - `WebGL2Backend.ts` — concrete implementation (ship this first; WebGPU in Phase 4)
  - `ShaderLibrary.ts` — shader source loading, compilation, caching
  - `FBOPool.ts` — named FBO management with resize
- `src/lib/shared/render-graph/translators/`:
  - `TrailTranslator.ts` — `TrailsIntent` → `TrailPassPayload`

**Validation:** unit tests for the translator; a standalone route (`/test/render-graph`) that renders a synthetic trail with decay. Zero integration into app rendering yet.

### Phase 1 — Trail migration in the 2D viewer (2 weeks)

The fix for the specific bug that triggered this spec.

**Build:**
- A new `TrailGPURenderer` service consumed by `AnimationRenderLoop`
- When `window.__TKA_TRAIL_GPU === true` (dev flag), the loop emits `TrailsIntent` to the render graph instead of drawing trails via Canvas2D
- The main Canvas2D stack continues to draw props/grid/glyphs/fire/led/charcoal as today
- Trail overlay is a transparent `<canvas>` layered over the Canvas2D stack, driven by the WebGL2 backend

**Validation:**
- Measure before/after on the 32-beat sequence: `trails=1208 → render=2ms` target (from 58–72ms)
- FPS goes from 10 to ≥ 58 on the user's machine
- Ship the flag on by default after one week of internal dogfooding

**Exits:** the old `TrailOverlayCanvas` (Canvas2D `destination-out` overlay) stays in the codebase but unused, ready to remove in Phase 5.

### Phase 2 — All 8 effects on the render graph (4 weeks)

Pull fire/led/charcoal/zap/sparkles/motion/bloom into the render graph as render passes. The effects-unification spec's translators produce `RenderPassDescriptor`s instead of Canvas2D / WebGL params directly.

**Build:**
- Translators for fire, led, charcoal, zap, sparkles, motion, bloom
- WebGL2 backend implementations for each pass kind (reuses existing fire/led/charcoal fragment shaders; ports zap/sparkles/motion/bloom from their current Canvas2D/Three.js implementations)
- `CompositeKind` pass that blits all effect FBOs onto the scene target in z-order

**Validation:** Effects Lab's 2D preview renders identically to today (within 1% pixel difference). Side-by-side regression test.

**Exits:** Legacy effect renderers (`FireOverlayRenderer`, `LedOverlayRenderer`, `CharcoalRenderer`, Three.js-side `ElectricityArc`, `SparkleEmitter`, `MotionBlur`, `BloomEffect`) become thin adapters that call into the render graph. Phase 5 deletes them.

### Phase 3 — 2D viewer as orthographic Threlte scene (4 weeks)

Delete the parallel rendering universe.

**Build:**
- `UnifiedViewerCanvas.svelte` — Threlte `<Canvas>` with a camera mode prop
- `props-as-planes` rendering path: a new `Prop2DMaterial` shader that produces the current Canvas2D prop visual
- Glyph rendering via textured plane or HTML-over-canvas (TBD during build — likely HTML for sharpness)
- `ViewerSplitPane.svelte` mounts `UnifiedViewerCanvas` twice with different camera modes

**Validation:**
- Visual parity test: side-by-side diff of new 2D scene vs current Canvas2D output across the top 20 sequences in the browse gallery
- FPS parity: new 2D ≥ old 2D with trails off
- FPS regression ceiling: new 2D ≥ 55fps with trails on (old 2D was 10fps — this is a guaranteed win)

**Exits:** `AnimatorCanvas.svelte`, `AnimationRenderLoop.ts`, the entire `src/lib/shared/animation-engine/services/implementations/` directory becomes eligible for deletion. Keep behind a feature flag for one release cycle.

### Phase 4 — WebGPU backend primary (3 weeks)

Swap the default.

**Build:**
- `WebGPUBackend.ts` — parity with `WebGL2Backend`
- `BackendFactory` returns WebGPU when available
- Shader library ports GLSL → WGSL (automatable for most passes)

**Validation:** feature-flagged rollout. 10% → 50% → 100% over two weeks. Measure FPS and longtask count per-backend in production telemetry.

### Phase 5 — Cleanup (1 week)

- Delete `AnimationRenderLoop.ts` and peers
- Delete `TrailOverlayCanvas` (Canvas2D overlay)
- Delete legacy fire/led/charcoal/zap/sparkles/motion/bloom renderers (kept as adapters in Phase 2)
- Delete `Canvas2DLegacyBackend` (was only a cutover aid)
- Delete the parallel `src/lib/shared/3d/effects/` directory (superseded by Phase 2)

## Interfaces between this spec and others

| Spec | Relationship |
|------|-------------|
| `2026-04-15-effects-unification-design.md` | This spec **consumes** the intent layer. Unification ships independently; render pipeline builds on top. Do not block on each other — effects-unification's canvas2d/webgl3d translators become intermediate layers that call into render-graph translators during Phase 2. |
| `2026-03-25-trail-offscreen-canvas-design.md` | Superseded. That spec ships as a Canvas2D `destination-out` overlay (Tier 1). This spec replaces it with a GPU ping-pong FBO (Tier 2+). The Canvas2D overlay can ship first as a short-term fix while this pipeline builds; Phase 1 of this spec replaces it. |
| `2026-04-14-sequence-viewer-unification-design.md` | Complementary. Viewer unification consolidates the shell (routes, auth flows, pending-action queue). This spec consolidates what's inside the shell (rendering). No overlap. |
| `project_camera_controls_library.md` | Complementary. OrbitControls is the camera interaction library; this spec is the rendering pipeline. Phase 3's orthographic camera uses the shared OrbitControls (locked to a single axis). |

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| **WebGL2 performance regressions vs hand-tuned Canvas2D for simple passes (grid, glyphs).** A generic shader pipeline can lose to a purpose-built Canvas2D call in the simplest cases. | Phase 1 only migrates trails. Phase 2 migrates effects where we know we're already GPU (fire, led, charcoal). Phase 3 migrates props/grid/glyphs with a visual-parity gate. If a pass regresses, keep Canvas2D emission alongside and let the backend decide — backend abstraction allows this. |
| **Shader compilation stalls on first frame.** WebGL2 shader compilation is synchronous and can block the main thread for 100–500ms. | `ShaderLibrary` precompiles the core shader set during app boot (idle callback). Compile failures fall back to a simpler shader. |
| **WebGPU browser fragmentation.** Safari 18 and Firefox adoption curves are non-linear. | `BackendFactory` chains WebGPU → WebGL2 → Canvas2D. WebGL2 is the workhorse until WebGPU penetration hits 80%, then flip the default. |
| **Feature flag explosion.** Phase 1–4 each add a flag. | Use one compound flag `render_pipeline_version: 1 \| 2 \| 3 \| 4`. Each phase bumps the value. Rollback = decrement. |
| **Mobile GPU memory pressure from per-tip FBOs.** A 5-performer sequence has 10 tips × 2 FBOs × 1024² × 4 bytes = 80MB just for trail FBOs at desktop resolution. | Mobile FBOs render at 512² (25% memory). Tip count caps at 6 active on mobile (3 performers); beyond that, consolidate into shared atlases. |
| **Export pipeline regression.** Today's export has deterministic frame-by-frame Canvas2D rendering. A render graph with GPU scheduling could produce nondeterministic timing. | The render graph is explicit about dependencies and pass ordering. Export mode calls `executeFrame` synchronously with `performance.now()` spoofed to the target frame time. No RAF involvement. Tested via frame-by-frame hash comparison against today's export. |
| **Three-way simultaneous refactor (effects-unification, viewer-unification, render pipeline).** | Hard sequence: effects-unification lands first (it's already drafted). Render pipeline starts Phase 0–1 in parallel but doesn't touch Effects Lab until effects-unification is stable. Viewer-unification is independent. |

## Success Criteria

**Phase 1 ship gate:**
- 32-beat sequence: `[FPS] ≥58fps` with `trails=on`, `trails=1208+` points. Current baseline: 10fps.
- No per-frame `[LongTask]` warnings during steady-state playback.
- Visual parity with today's trail rendering (within subjective tolerance — colors, decay curve, thickness all match presets).

**Phase 3 ship gate:**
- 2D viewer FPS ≥ 3D viewer FPS on the same sequence (trails + fire active).
- `src/lib/shared/animation-engine/` directory size reduction ≥ 40%.
- Zero features regressed per the regression harness (practice mode, export, effects lab, animation settings modal, gallery preview).

**Phase 5 ship gate:**
- Single source of truth for all rendering: `src/lib/shared/render-graph/`
- Zero remaining references to `Canvas2DAnimationRenderer`, `AnimationRenderLoop`, or their peers
- `EffectsConfig` is the single input shape for every visual effect across every surface
- Video export uses the same code path as live rendering

## Open Questions

1. **Glyph rendering strategy in Phase 3.** HTML-over-canvas keeps SVG crispness at any zoom but complicates fullscreen/export. Shader-rendered glyphs are uniform but lose SDF sharpness at export resolution. Decision deferred to Phase 3 spike.
2. **Trail FBO sizing.** Static 1024² or viewport-matched? Static is simpler; viewport-matched is more correct for long-throw camera moves. Default to viewport-matched with a 2048² ceiling, revisit after Phase 1 metrics.
3. **Per-beat trail "chapters" for export.** Current export can render each beat independently and concatenate. GPU FBOs carry state across beats, so export needs explicit state snapshotting. Phase 1 solves naive export; revisit in Phase 4 if export performance regresses.
4. **Threlte `Canvas` lifecycle under the drawer.** Mounting / unmounting `UnifiedViewerCanvas` on every drawer open/close is expensive (WebGL context re-creation). Phase 3 needs a persistent-context pattern — likely a global `RenderRoot` that holds the GL context and rents views to components.

## Appendix A — Example: migrating the trail path (Phase 1)

Today:

```ts
// AnimationRenderLoop.ts:453
if (this.trailOverlay && effectiveTrailsVisible && !params.suppress2DOverlays) {
  this.trailOverlay.renderFrame({ /* Canvas2D params */ });
}
```

After Phase 1:

```ts
// AnimationRenderLoop.ts (rewritten section)
if (effectiveTrailsVisible && !params.suppress2DOverlays) {
  const intent = this.effectsConfig.trails;
  const payload = trailTranslator.toTrailPassPayload(intent, {
    tips: this.currentTipVelocities,
    newSegmentsSinceLastFrame: this.pollNewSegments(),
  });
  this.renderGraph.emitPass({
    kind: "trail",
    order: Z_TRAIL,
    target: "scene",
    payload,
  });
}
// Backend executes the pass inline; no second canvas, no Canvas2D overlay.
```

Trail point arrays (`reusableBlueTrailPoints`, `reusableRedTrailPoints`) can shrink to just the segments added this frame. The 1208-point buffer is gone.

## Appendix B — Why not WebGPU from day one

WebGPU is the right long-term backend. It's not the right Phase 1 backend because:

- Firefox support is still behind a flag in early 2026
- Shader porting (GLSL → WGSL) takes a week that isn't worth blocking on
- Browser debugging tools for WebGPU are weaker than WebGL2
- The WebGL2 backend is ~80% of the WebGPU perf win (trails constant-cost, effects parallel) at 20% of the engineering cost

Phase 4 swaps WebGPU in when the ecosystem has caught up and the WebGL2 backend has exposed all the asymmetries.
