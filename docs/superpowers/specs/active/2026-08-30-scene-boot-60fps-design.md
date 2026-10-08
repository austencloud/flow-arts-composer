---
status: active
value: null
effort: null
work_state: verification
remaining: Verify the scene boot warmup, prefetch, frame gate, and first-visit 60 FPS acceptance on real scenes.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Scene Boot 60FPS — First-Visit Loading That Proves Smoothness Before Reveal

**Triage evidence (2026-10-07):** `src/lib/shared/3d/scene-boot/renderer-warmup.ts`, `scene-prefetch.ts`, and `frame-gate.ts` exist. This establishes implementation files, but first-visit frame-rate measurements on the specified scenes were not recorded in this review.

**Date:** 2026-08-30
**Status:** Implementation recorded; first-visit performance verification pending. Austen approved full-fidelity execution on 2026-08-30 ("A, full fidelity … send this to the moon … across all situations we have a sexy FPS target").
**Scope:** All 3D scenes app-wide (option A)

## Problem

3D scenes jank on first visit. The costs, in order of measured impact:

1. **Shader compile happens AFTER the curtain drops.** `SceneShaderWarmup.svelte`
   never touches the renderer — it waits `tick()` + 2 rAFs and calls it warm.
   First real frames pay program linking on the main thread. Five scenes
   (Winter, Ember, Rainbow, Cosmic, Void) each hand-roll a *synchronous*
   `renderer.compile()` (main-thread block, janks the curtain's own progress
   bar); Blossom uses `compileAsync`; Forest, Celestial, Autumn, Ocean — the
   retained, most-used scenes — compile nothing.
2. **Nothing is warmed before intent.** The `vendor-three` chunk,
   `Viewer3DCanvas` chunk, per-scene GLBs (5–100 MB per scene), and the
   Draco/Basis decoder WASM are all fetched only after the user clicks into 3D.
   `LazyMount` already has an idle `prefetch` prop; the 3D call sites don't use
   it.
3. **The 2D animated background taxes the boot window.** The
   `@austencloud/backgrounds` rAF loop costs ~10–12 ms/frame of main thread
   (A/B-proven: 41fps → 60fps with it stopped). The museum suppresses it;
   `Viewer3DCanvas` does not — so GLB parse, geometry upload, and shader
   compile all compete with a backdrop nobody can see behind the opaque
   curtain. `background-hold.svelte.ts` (freeze, keyed, refcounted) already
   exists and is the right owner.
4. **The curtain reveals on "loaded," not "smooth."** `sceneReady` fires when
   assets are ready + 2 frames painted. Nothing proves the frame rate is
   actually stable before the fade-out.
5. **Progress goes dark after fetch.** `initialRevealSettledProgress` covers
   only GLB network progress. Parse/upload/compile — often seconds — show a
   full bar sitting still.
6. Minor: `procedural-engine`'s three `GLTFLoader`s have no
   Draco/Meshopt/KTX2 wiring (`model-registry.ts:55`, `model-cache.ts:62`,
   `WorldSceneContent.svelte:5`).

## Design

One new shared owner, `src/lib/shared/3d/scene-boot/`, plus surgical wiring
into existing seams. **No quality reduction anywhere — full fidelity.** The
existing `adaptive-quality-state` keeps its role (steady-state pixel-ratio
guard) and is untouched.

### 1. Real shader warmup (`scene-boot/renderer-warmup.ts`)

Owner of pre-reveal GPU warmup, consumed by `SceneShaderWarmup.svelte` (which
stays the component seam — it is inside the Threlte `<Canvas>` at
`Viewer3DCanvas.svelte:467`, so `useThrelte()` provides renderer/scene/camera).

Sequence, all behind the still-opaque curtain:

1. Collect renderable objects from the scene graph.
2. `renderer.compileAsync(object, camera, scene)` per object (the museum's
   proven pattern, `Museum3DScene.svelte:1478-1509`), reporting fractional
   progress `compiled/total`. Falls back to a single `compileAsync(scene,
   camera)` where per-object iteration finds nothing, and to the existing
   2-frame settle if `compileAsync` is unavailable.
3. `tick()` + 2 rAF paint settle (keep — it warms upload paths compile misses).
4. **Frame gate:** measure rAF deltas; declare warm after 5 consecutive frames
   ≤ 20 ms, capped at 1500 ms so a weak GPU never holds the curtain hostage.
   Pure logic in `scene-boot/frame-gate.ts` (unit-testable: feed deltas, get
   verdict).

The `cacheKey` skip-path and `additionalReady` gate keep their exact semantics.
The five scenes' inline synchronous `renderer.compile()` calls are **removed**
(one concept, one owner); Blossom's `compileAsync` likewise. The 15 s
force-ready timeout in `Viewer3DCanvas` remains the outer safety net.

### 2. Idle prefetch track (`scene-boot/scene-prefetch.ts` + manifest)

- `scene-asset-manifest.ts`: per-`BackgroundType` list of the scene's GLB URLs
  plus the decoder runtimes (`/draco/*`, `/basis/*`). Guarded by a contract
  test that greps the scene sources for `/models/...glb` literals and fails on
  drift (repo's established anti-drift pattern).
- `warmSceneAssets(background)`: on `requestIdleCallback`, `fetch(url,
  { priority: "low" })` each manifest URL into the HTTP cache. Deduped by a
  module-level `Set`. Hard gates: skip when `navigator.connection.saveData`,
  skip when offline, warm **only the currently selected background** (never
  all ten — ocean alone is ~100 MB).
- Chunk warm: `ViewerMotionSurface.svelte`'s `LazyMount` gets `prefetch`
  (warms `Viewer3DCanvas` + `vendor-three` on idle). The environment scene
  module itself is warmed with the same reused-`import()` trick.
- Trigger points: sequence-viewer shell mount (3D is one click away),
  `Viewer3DFullscreen`, `Scene3DPreview`.

Result: on a warm path, first 3D open reads chunks + GLBs from cache and the
curtain window shrinks to parse/upload/compile — which §1 hides properly.

### 3. Boot-window background hold (`Viewer3DCanvas`)

`holdBackground("viewer3d-boot:<instanceId>")` from canvas mount until
`sceneReady`, and continuously while `fullScreen` (fully occluded). Release on
teardown. Hold (freeze), not suppression (unmount) — instant resume, no
re-init jank, per `background-hold.svelte.ts`'s own doc. Split-pane
steady-state behavior is unchanged (playback holds already exist).

### 4. Honest staged progress

`scene-feature-state` gains `warmupProgress` (0–1, monotonic, reset with
`resetReady`). The curtain's displayed value becomes
`assetProgress * 0.75 + warmupProgress * 0.25` — network fills to 75%, compile
walks the rest, the frame gate rides the last sliver. Bar never regresses,
never sits full while seconds of work remain.

### 5. Boot instrumentation (`scene-boot/boot-spans.ts`)

`performance.mark`/`measure` spans — `scene-boot:assets`, `:compile`,
`:settle`, `:reveal` — and a `window.__sceneBoot` summary (per-phase ms +
frame-gate verdict) so DevTools MCP and future sessions can assert numbers
instead of eyeballing. Zero overhead when `performance` is absent.

### 6. Consistency sweep

Wire `useDraco`/`useKtx2`/`useMeshopt` into the three bare `GLTFLoader`s in
`procedural-engine` (same wiring as `GltfAsset.svelte:16-19`).

## Alternatives considered

- **OffscreenCanvas/worker rendering** — the real fix for the 2D background's
  steady-state tax, but it lives in the external package (T7,
  `project_unified_gpu_render_pipeline`). Out of scope; the hold covers the
  boot window today.
- **Progressive reveal (stream scene in at low fidelity, refine)** — violates
  the full-fidelity directive and reads as pop-in. Rejected.
- **Runtime-recorded manifests (record URLs on first visit, warm on later
  visits)** — doesn't help the true first visit; the static manifest + contract
  test does, at the cost the test neutralizes.

## Out of scope (recorded deliberately)

- LOD / ObsidianPillars instancing / shadow-caster limits — open items of
  `specs/backlog/2026-05-23-3d-scene-performance-design.md`, steady-state not
  boot.
- Avatar pipeline — lives in the `@austencloud/scene-3d` **patch** (shared GLTF
  cache + render-warmup registry already exist there). The patch is not
  touched.
- Museum internals — already runs its own compileAsync warmup + suppression.
- `UnifiedViewerCanvas.svelte` — zero importers; not wired.

## Verification plan

- Unit: frame-gate logic, manifest contract test, prefetch gating (saveData /
  dedupe).
- `npm run check` green in the worktree.
- Runtime, via DevTools MCP on a worktree vite server: for each environment
  scene — curtain shows staged progress, reveal happens with no long task
  after it (performance trace), `__sceneBoot` spans populated, no console
  errors. Viewport sweep per `visual-verification-mandatory.md` on the 3D
  viewer surface (curtain + revealed scene).
- Background hold verified: backgrounds controller frozen during boot
  (runtime query), resumed after.
