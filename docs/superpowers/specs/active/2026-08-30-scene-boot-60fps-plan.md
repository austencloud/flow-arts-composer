---
status: active
value: null
effort: null
work_state: verification
remaining: Check implemented scene-boot phases against the first-visit performance and visual reveal gates; the checked ledger alone is insufficient.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Scene Boot 60FPS — Implementation Plan

Spec: `docs/superpowers/specs/active/2026-08-30-scene-boot-60fps-design.md` (read it first).
Worktree: `E:/worktrees/tka-platform/scene-boot-60fps` — ALL work happens here. Never touch `E:/tka-platform`.

## Ledger

- [x] Phase 1 — scene-boot module (frame gate, warmup owner, boot spans)
- [x] Phase 2 — SceneShaderWarmup upgrade + remove per-scene compile calls
      (also lands Phase 3's `reportWarmupProgress`/`bootDisplayProgress` state,
      which Phase 2 consumes — kept together so every commit typechecks)
- [x] Phase 3 — staged progress (scene-feature-state + curtain); the curtain
      also now waits on warm-up, without which the frame gate would prove
      smoothness after the reveal it exists to precede
- [x] Phase 4 — boot-window background hold in Viewer3DCanvas
- [x] Phase 5 — prefetch track (manifest + warmer + LazyMount prefetch wiring)
- [x] Phase 6 — procedural-engine loader wiring, through a new shared
      `scene-boot/gltf-decoders.ts`. The trio could not be attached verbatim:
      `useKtx2` calls `useThrelte()` internally, and none of the three sites is
      a component init (one is a `<script module>` block, two are plain class
      constructors), so the owner splits geometry decoders (safe anywhere) from
      the texture decoder (component-init only)
- [x] Phase 7 — unit tests + contract test + `npm run check` green
      (18 new assertions; `svelte-check found 0 errors and 0 warnings`)

## Phase 1 — `src/lib/shared/3d/scene-boot/`

New module, four files. Pure TS except where noted; follow `code-style` (no
barrel exports, module-level singleton getters where needed, conversational
comments only for non-obvious constraints).

**`frame-gate.ts`** — pure logic:

```ts
export interface FrameGateConfig { requiredConsecutive: number; frameBudgetMs: number; capMs: number; }
export const DEFAULT_FRAME_GATE: FrameGateConfig = { requiredConsecutive: 5, frameBudgetMs: 20, capMs: 1500 };
export function createFrameGate(config?: Partial<FrameGateConfig>) // returns { observe(deltaMs, elapsedMs): boolean /* true = warm */ }
```

Warm when `requiredConsecutive` consecutive deltas ≤ `frameBudgetMs`, OR
`elapsedMs ≥ capMs`. A delta over budget resets the streak. No Date.now inside —
caller supplies elapsed.

**`boot-spans.ts`** — `performance.mark`/`measure` wrapper:

- `beginBootSpan(phase: "assets" | "compile" | "settle")` / `endBootSpan(phase)`
  → marks `scene-boot:<phase>:start/end` + a measure `scene-boot:<phase>`.
- Maintains `window.__sceneBoot = { assetsMs, compileMs, settleMs, frameGate: "passed" | "capped" | null, revealedAt }` (typed via a
  `declare global` block). All guarded so SSR/absent-performance is a no-op.
- Reset function called when a new boot starts (scene switch).

**`renderer-warmup.ts`** — the compile owner:

```ts
export interface WarmupHandles { renderer: WebGLRenderer; scene: Object3D; camera: Camera; }
export async function warmupRenderer(handles, opts: { onProgress?: (f: number) => void; signal?: AbortSignal }): Promise<void>
```

1. Collect compile targets: traverse `scene`, count meshes/points/lines with
   materials.
2. If `renderer.compileAsync` exists: per-object `await
   renderer.compileAsync(object, camera, scene)` reporting `i/total` through
   `onProgress` (museum's pattern — see
   `src/lib/features/museum/components/game/Museum3DScene.svelte:1478-1509`).
   Wrap each await in try/catch — a failed compile logs `console.warn` once and
   continues (never blocks reveal). Check `signal.aborted` between objects.
3. Else (no compileAsync): fall through silently — the settle frames in the
   component cover it.

Do NOT call this from anywhere except SceneShaderWarmup (and tests).

## Phase 2 — SceneShaderWarmup upgrade

`src/lib/shared/3d/components/SceneShaderWarmup.svelte` — it renders inside the
Threlte `<Canvas>` (`Viewer3DCanvas.svelte:467`, `UnifiedViewerCanvas.svelte:134`,
`src/routes/test/celestial-scene/+page.svelte:109`), so `useThrelte()` gives
`renderer`, `scene`, `camera`. New sequence inside the existing `$effect` (all
existing gating — `waitForAllFeatures`, `cacheKey`, `additionalReady`,
cancellation — keeps identical semantics):

1. `beginBootSpan("compile")` → `warmupRenderer(...)` with `onProgress` →
   `sceneFeatures.reportWarmupProgress(f * 0.8)` (see Phase 3) →
   `endBootSpan("compile")`.
2. `beginBootSpan("settle")` → existing `tick()` + 2 `afterPaint()` →
   frame-gate loop: rAF deltas through `createFrameGate()` until warm
   (report progress `0.8 + streakFraction * 0.2`), then `endBootSpan("settle")`.
   Use `performance.now()` for elapsed. Respect `cancelled`.
3. `reportWarmupProgress(1)`, cache key, `onReadyChange(true)`.

Camera note: `useThrelte()` camera is a `currentWritable` — read `.current`.
If renderer/scene/camera are unavailable (defensive), skip straight to the old
settle path — never throw.

**Remove the now-redundant inline compile calls** (shared owner supersedes;
delete the call + any now-unused imports/refs, nothing else):

- `src/lib/shared/3d/environments/scenes/WinterScene.svelte:156` (sync compile)
- `src/lib/shared/3d/environments/scenes/EmberScene.svelte:287`
- `src/lib/shared/3d/environments/scenes/RainbowScene.svelte:59`
- `src/lib/shared/3d/environments/scenes/CosmicScene.svelte:125`
- `src/lib/shared/3d/environments/scenes/VoidScene.svelte:39`
- `src/lib/shared/3d/environments/scenes/BlossomScene.svelte:347-348` (compileAsync)

Read each site's surrounding code before deleting — if a call does more than
warmup (e.g. gates its own reportReady), preserve the non-compile behavior.
Line numbers may have drifted; locate by grep `renderer.current.compile` /
`compileAsync`, and confirm zero remaining hits under
`src/lib/shared/3d/environments/scenes/` afterward.

## Phase 3 — staged progress

`src/lib/shared/3d/scene-features/state/scene-feature-state.svelte.ts`:

- Add `warmupProgress` state (0–1). `reportWarmupProgress(f)` — monotonic clamp
  like `reportProgress`. Reset to 0 wherever the initial-reveal cycle resets
  (find where `resetReady` is invoked on scene switch; mirror that).
- Add derived `bootDisplayProgress = initialRevealSettledProgress * 0.75 + warmupProgress * 0.25`.

`src/lib/shared/3d/scene-features/components/SceneLoadingCurtain.svelte`:

- Swap its progress source from `initialRevealSettledProgress` to
  `bootDisplayProgress`. The `additionalReveal*` blending props keep working
  exactly as today (they compose on top; read the current math and preserve it).

## Phase 4 — boot-window background hold

`src/lib/shared/3d/components/Viewer3DCanvas.svelte`:

- Import `holdBackground`/`releaseBackground` from
  `$lib/shared/background/shared/state/background-hold.svelte`.
- Generate one `const holdKey = "viewer3d:" + crypto.randomUUID()` per instance
  (or an incrementing module counter — no Date.now).
- `$effect`: hold while `!sceneReady || fullScreen`; release otherwise and in
  the effect teardown. Follow the exact idempotent pattern of
  `BackgroundHost.svelte:289-307` (hold/release + teardown release).
- One comment stating the constraint: boot compile competes with the backdrop
  rAF; fullscreen fully occludes it.

## Phase 5 — prefetch track

**`scene-boot/scene-asset-manifest.ts`**: map `BackgroundType` (enum from
`@austencloud/backgrounds`) → `readonly string[]` of the GLB URLs that scene
loads, ONLY for the ten Environment3D scenes (grep each
`src/lib/shared/3d/environments/scenes/**` component for `/models/...glb`
literals, including imported constants). Also export
`DECODER_RUNTIME_URLS = ["/draco/draco_wasm_wrapper.js", "/draco/draco_decoder.wasm", "/basis/basis_transcoder.js", "/basis/basis_transcoder.wasm"]`
(verify actual filenames in `static/draco/` and `static/basis/` — list the dirs,
don't guess).

**`scene-boot/scene-prefetch.ts`**:

```ts
export function warmSceneAssets(background: BackgroundType): void
export function warmDecoderRuntimes(): void
```

- Module-level `Set<string>` dedupe. `requestIdleCallback` (fallback
  `setTimeout(200)`), then sequential `fetch(url, { priority: "low" })` —
  sequential, not parallel, to stay off the network's critical path; swallow
  per-URL failures silently (warm path only).
- Gates at the top of both: `!browser` → return; `navigator.onLine === false` →
  return; `(navigator as any).connection?.saveData` → return.
- Export a `_resetForTests()` helper.

**Wiring:**

- `src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte`: add
  `prefetch` to the `LazyMount` for `Viewer3DCanvas` (line ~207). In the same
  component (it knows the selected background or can read the settings state
  that Environment3D reads — trace how `Viewer3DCanvas` learns the current
  `BackgroundType` and read the same source), call
  `warmSceneAssets(currentBackground)` + `warmDecoderRuntimes()` in an
  `onMount`/`$effect` (browser-only).
- `src/lib/features/scene-3d-collection/components/Scene3DPreview.svelte` and
  `src/lib/shared/3d/components/Viewer3DFullscreen.svelte`: same two warm calls
  (they statically import Viewer3DCanvas, so no LazyMount change there).

## Phase 6 — procedural-engine loaders

Wire the same decoder trio used in
`src/lib/shared/3d/environments/primitives/GltfAsset.svelte:13-19` into the
bare `new GLTFLoader()` sites:

- `src/lib/shared/3d/procedural-engine/vegetation/services/model-registry.ts`
- `src/lib/shared/3d/procedural-engine/rendering/model-cache.ts`
- `src/lib/shared/3d/procedural-engine/components/WorldSceneContent.svelte`

(Paths approximate — grep `new GLTFLoader` under `procedural-engine/` for the
real ones. Match GltfAsset's helper usage exactly; if its `useDraco`/`useKtx2`/
`useMeshopt` helpers are local to GltfAsset, extract them into
`scene-boot/gltf-decoders.ts` and have BOTH GltfAsset and these sites consume
the shared owner.)

## Phase 7 — tests + check

New unit tests under `tests/unit/scene-boot/`:

1. `frame-gate.test.ts` — streak pass, streak reset on a slow frame, cap
   fallback, custom config.
2. `scene-asset-manifest-contract.test.ts` — read every
   `src/lib/shared/3d/environments/scenes/**` source as text, extract
   `/models/...glb` literals, assert each appears in the manifest for its scene
   and the manifest lists no URL absent from the sources. (Follow the style of
   `tests/unit/scene-prop-picker-contract.test.ts` / the sequence-viewer shell
   contract test.) Constants indirection: if a scene imports URLs from a
   `.ts` constants module, include that module in the scanned set.
3. `scene-prefetch.test.ts` — saveData gate, dedupe (second call fetches
   nothing), offline gate. Mock `fetch` + `requestIdleCallback`.

Then: `npm run check > /tmp/check.log 2>&1` once, grep it for errors, fix,
repeat via `check:fast` for iteration. Run the new tests + the existing
contract suites: `npx vitest run tests/unit/scene-boot tests/unit/scene-prop-picker-contract.test.ts tests/unit/sequence-viewer-shell-contract.test.ts`.

## Commit discipline

One commit per phase (or sensible grouping), each with explicit pathspec:
`git commit -m "..." -- <paths>`. Never `git add -A`. End every commit message
with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Hard constraints

- Do not touch `patches/`, `node_modules/@austencloud/*`, the museum module,
  `adaptive-quality-state`, or anything under `E:/tka-platform` (primary
  checkout).
- Do not start any dev server, and never anything on :5173.
- No new dependencies.
- Mark ledger items `[x]` in this file as phases land (commit the plan-file
  update with the phase's commit).
