---
status: active
value: 3
effort: S
remaining: "Verify Animation Engine Re-Architecture — Fused Design & Handoff Spec against the current Animation Engine Re-Architecture — Fused Design & Handoff Spec runtime and acceptance criteria before resuming implementation. Prior recorded remainder: '5 managers + plugin registry + HMR fix shipped; StateSynchronizer was relocated, not dissolved as specced'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Animation Engine Re-Architecture — Fused Design & Handoff Spec

**Queue evidence (2026-10-07):** Managers, plugin registry, and HMR fix landed; StateSynchronizer dissolution remains unresolved. See frontmatter for the remaining work.

> **DRIFT WARNING — 2026-08-02.** 5 managers + plugin registry + HMR fix shipped; `StateSynchronizer` was **relocated, not dissolved** as specced
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-05-28
**Original status (historical):** Approved for execution — handoff to the re-architecture agent
**Supersedes ad-hoc work on:** AnimatorCanvas HMR fix (folded into Phase 4 here)

---

## 0. Why this spec exists (fusion note)

Two workstreams converged:

1. **Re-architecture** (owning agent): move the animation engine from 4.6's pipeline-stage-controller seam to a per-instance shared store + single-responsibility managers + thin façade, plus an effect plugin registry, offscreen export, and an AnimatorCanvas thin shell. Phases P0–P5 below.
2. **HMR regression fix** (this agent): AnimatorCanvas hot-module-reload started failing ~3 days ago. Root cause diagnosed (Section 1). The permanent fix is **already inside P4** — removing the in-component self-recursion. This spec promotes that from a side effect to a tracked, verified outcome and adds a low-risk interim bridge so HMR is usable while P0–P3 land.

The two are fused because P4's "consolidate the disassemble self-recursion" step *is* the structural HMR fix. Doing them separately would mean two agents editing the same 1147-line file — collision and rework risk. One owner, one spec.

---

## 1. HMR regression — root-cause diagnosis (verified 2026-05-28)

**Symptom (console):**
```
[vite] Failed to reload AnimatorCanvas.svelte. ... importing non-existent modules.
🚨 UNHANDLED PROMISE REJECTION: TypeError: Cannot read properties of undefined (reading 'default')
    at AnimatorCanvas.svelte ... at HMRClient.queueUpdate ... at handleMessage
[FloraInstances] Failed to load ocean flora scene: TypeError: Failed to fetch
```

**Findings (all evidence-backed this turn):**

- The crash stack is entirely inside vite's HMR client (`client:`, `queueUpdate`, `handleMessage`). When an edited upstream module hot-updates, AnimatorCanvas's module evaluates to `undefined`, so vite reads `.default` off `undefined` → throw.
- AnimatorCanvas **self-imports** at line 53: `import AnimatorCanvasSelf from "./AnimatorCanvas.svelte"`, used at lines 825 & 849 to render the two split (blue-only / red-only) canvases. A self-import is a **circular module** (A→A).
- This is the **only self-import in the entire `src/` tree** (verified by a full grep sweep). De-risking it fully clears the codebase of self-circular HMR fragility.
- `svelte-check`: **0 errors** across the project. No real compile/type break — the failure is purely HMR partial-accept on the circular module.
- **Trigger:** `@sveltejs/kit` bumped `^2.48.5 → ^2.61.1` within the last 8 days (matches "didn't happen 3 days ago"). Kit transitively bundles `@sveltejs/vite-plugin-svelte`; the newer plugin's partial-accept handling of self-circular modules regressed. The self-import had been present since 2026-03-12 (`30d9991b0`) and worked under the old plugin.
- `[FloraInstances] Failed to fetch` is **collateral**, not a separate bug: the 46 MB `static/models/ocean/ocean_flora_scene.glb` (confirmed present) fetch is aborted when the failed HMR forces a page reload mid-flight.

**Conclusion:** Svelte 5 *recommends* self-import (the `<svelte:self>` element is deprecated — confirmed via Svelte docs), so a re-export shim or reverting to `<svelte:self>` does not help (still A→B→A). The robust fix is to **eliminate the recursion**: the split canvases must render a shared, non-recursive child rather than a second instance of AnimatorCanvas. That is exactly what P4 does.

---

## 2. Target architecture (from the re-architecture plan)

Seam moves from "pipeline-stage controllers" to tldraw/PixiJS grain: **one reactive store per canvas instance**, single-responsibility managers reading/writing it directly, a thin façade. **No per-tick mirroring** — that dissolves `StateSynchronizer` / `syncServiceState()` (currently `AnimationEngine.svelte.ts:551` & `:1373`).

### AnimationStore (`.svelte.ts`, per-instance) — single source of truth
Holds everything currently scattered + mirrored: visibility flags, displayed-glyph state, prop dims/types, trail settings, prerender progress, init/loading flags, `activeEffect`, `tipEffectMap`. `$state` fields exposed via getters. Managers write; UI reads via `$derived`. **Per-instance, not global** — disassemble (3 canvases) and split (2 canvases) each need independent visibility/effects. Matches tldraw's per-Editor store.

### Managers (systems) — each SRP, each takes `(store, services)`, reads/writes the store directly
Replace the 5 stage-controllers and dissolve the god class:

- **LifecycleManager** — canvas create / mount / resize-observe / teardown. Absorbs `AnimatorCanvasInitializer`; owns init for real.
- **PropSystem** — prop resolve + texture + SVG. Absorbs `PropPipeline` + `PropTypeManager` + `PropTypeChanger`.
- **EffectSystem** — effect registry + tipMap sync + config→renderer. Absorbs `EffectRendererManager` + `EffectController`.
- **FrameSystem** — per-frame params + glyph-label calc. Absorbs `FrameParameterBuilder`; folds in the mis-named `FrameBuilderService`.
- **PlaybackSync** — playback controller → render loop.
- **No StateSynchronizer.** State lives once, read through getters.

### AnimationEngine → thin façade (~150 lines, the tldraw Editor analog)
Construct store + managers, wire them, expose `update(props)` + `dispose()`. Down from the current **1510 lines**.

### Effect plugin registry
Collapse the ~20 effect edit-sites into one self-describing plugin array:

```ts
interface EffectPlugin {
  id: EffectType;
  createRenderer(): OverlayRenderer;   // shared lifecycle contract
  buildFrameInput(ctx): unknown;        // replaces per-effect buildInput in the render loop
  needsDt?: boolean;
  defaultConfig: EffectConfig;
  customizePanel?: () => Promise<Component>;
}
```

Everything derives from `EFFECT_PLUGINS`: renderer instances become a `Map<EffectType, OverlayRenderer>` (drops 16 named fields + ~28 lines of `prevHasXxxTips` boilerplate), `RenderLoopConfig` slots are generated, the 16 typed `updateXxx`/getters collapse to the existing generic `updateEffect(id, patch)`. Add an `OverlayRenderer` abstract base for the ~40 lines of canvas boilerplate each renderer copy-pastes today. WebGL effects (fire / charcoal / LED) implement the same contract; special-casing stays behind it. **A 17th effect = 1 plugin + 1 renderer + 1 registration line.**

### Offscreen export
Wire the already-built `createOffscreenContext(size)` (`RenderContextFactory.ts:22`, currently zero callers). `VideoExportOrchestrator`: create offscreen context at output resolution → per frame `calculateStateForStep` → `offscreenCtx.triggerRender()` → capture from its canvas → dispose. **Delete the live-canvas resize/pause/restore hack** (`VideoExportOrchestrator.ts:402-661`) and the `onResizeForExport` / `onRestoreFromExport` callbacks. Implement the `createLiveContext` stub (`RenderContextFactory.ts:13`, currently throws) so AnimatorCanvas builds through the factory. Registry stays as the lookup directory.

### AnimatorCanvas → thin shell (~120 script lines, from 1147)
- Mount → `factory.createLiveContext(container)` + register.
- ONE `$effect` → `engine.update(props)`.
- Display state via `$derived` from the store (kill the 8-flag local mirror at `AnimatorCanvas.svelte:325-343`).
- Destroy → `dispose` + unregister.
- **Move out:**
  - the 167-line LED/fire diagnostic harness → effects lab / debug module;
  - the fire-cache + visibility-bridge `$effect`s → store subscriptions;
  - **the in-component disassemble self-recursion → the existing `DisassembleCanvasView.svelte` / `DisassembleTransition.svelte`** (both verified present in `lib/shared/animation-engine/components/`). **This removes the line-53 self-import and is the permanent HMR fix.**
- The `queueMicrotask` / double-`rAF` race workarounds disappear once `LifecycleManager` sets `isInitialized` after the loop starts.

---

## 3. HMR additions to the plan (this agent's contribution)

### 3.1 Interim bridge — Phase B0 (do first, before P0)
Until P4 removes the self-import, add a **throwaway** vite dev-only plugin that forces a clean full page reload when `AnimatorCanvas.svelte` changes, instead of the broken partial-accept. ~15 lines in `vite.config.ts` via `handleHotUpdate` (filter on the file path → `server.ws.send({ type: "full-reload" })` and return `[]`).

- **Risk:** none to the render path; touches only dev HMR behavior.
- **Cost to the editor:** editing this one file does a full reload instead of granular HMR. Acceptable interim.
- **Removal:** **delete this plugin in P4** once the self-import is gone. The spec's P4 checklist includes its removal so it cannot rot.
- **Collision note:** lives in `vite.config.ts`, not the component — zero overlap with the re-architecture file churn.

### 3.2 P4 acceptance — promote the self-import removal to a verified outcome
P4 is **not complete** until:
1. `grep -rn 'from "\./AnimatorCanvas.svelte"' src` returns **zero** matches (no self-import anywhere).
2. A full self-import sweep of `src/` returns zero (codebase stays free of self-circular modules).
3. **HMR survival test:** with the app running, the disassembled (3-canvas) and split (2-canvas) views mounted, edit an upstream value-import of the canvas (e.g. `getRenderContextRegistry.ts`) and confirm the update applies **without** the `Cannot read properties of undefined (reading 'default')` crash and **without** a forced full reload.
4. The Phase B0 interim vite plugin is deleted.

### 3.3 Watch-out for the owning agent
The kit `2.48 → 2.61` bump changed svelte-HMR partial-accept broadly, not just for AnimatorCanvas. Self-import was the only circular module in `src/`, so removing it should fully resolve it — but if HMR misbehaves on any *other* module during the migration, suspect a newly-introduced circular import (manager ↔ store ↔ façade cycles are easy to create). Keep the store/manager/façade dependency graph acyclic: managers import the store type, the façade imports managers, nothing imports the façade back.

---

## 4. Migration phases — each ships green + verified

| Phase | Move | Kills |
|-------|------|-------|
| **B0 (bridge)** | Add dev-only vite full-reload guard for `AnimatorCanvas.svelte` | the HMR crash + aborted-fetch cascade (interim) |
| **P0** | Introduce `AnimationStore`; engine writes it, UI reads getters; delete mirroring | `syncServiceState`, StateSynchronizer rationale |
| **P1** | Extract real managers from `update()` / `handleVisibilityChange()` onto the store; engine → façade | the 1510-line god class |
| **P2** | Effect plugin registry + `OverlayRenderer` base | 20-site effect addition, `prevHas*` boilerplate |
| **P3** | Wire offscreen export; delete resize hack (`VideoExportOrchestrator.ts:402-661`) + callbacks | the export anti-pattern |
| **P4** | AnimatorCanvas → shell; extract diagnostics; **consolidate disassemble onto `DisassembleCanvasView` / `DisassembleTransition` (removes self-import)**; **delete the B0 bridge** | 1147-line component **+ the HMR self-reference (permanent fix)** |
| **P5** | Implement `createLiveContext`; build via factory; delete dead stubs | dead infrastructure |

**Verification each phase:** `npm run check` + `npm run build` + exercise live playback, disassemble, split, inline players, effects lab, export. **P4 additionally:** run the HMR survival test in §3.2.

---

## 5. Grounding evidence (anti-fabrication record)

- `AnimatorCanvas.svelte` self-import: line 53; recursive use lines 825, 849. Only self-import in `src/`.
- `AnimationEngine.svelte.ts`: 1510 lines; `syncServiceState()` at :1373, called :551.
- `AnimatorCanvas.svelte`: 1147 lines; local visibility mirror :325-343.
- `DisassembleCanvasView.svelte`, `DisassembleTransition.svelte`: present in `lib/shared/animation-engine/components/`.
- `RenderContextFactory.ts`: `createLiveContext` :13 (throwing stub), `createOffscreenContext` :22 (no callers).
- `static/models/ocean/ocean_flora_scene.glb`: present, 46,756,904 bytes.
- `svelte-check`: 0 errors, 29 warnings (1 file) project-wide.
- Regression trigger: `package.json` `@sveltejs/kit ^2.48.5 → ^2.61.1` within last 8 days.
- Svelte 5: `<svelte:self>` deprecated in favor of self-import (Svelte docs, via Context7).
