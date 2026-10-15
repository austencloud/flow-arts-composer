# W4 test-page types ledger

Date: 2026-10-15. Branch: `codex/swarm-types-w4-testpages`.
Observed starting HEAD: `355fbd5270` (`Merge branch 'codex/swarm-svelte-dedupe'`). Starting working tree was clean.

**Observation:** The brief lists 142 errors across 14 Svelte files. No full type check was run, as instructed.
**Inference:** These changes address 71 listed errors; 71 remain dependent on missing ocean APIs. Counts below come from inspecting the listed diagnostics and current declarations, not a checker run. The coordinator must confirm them with the full check.

| file (under `src/routes/test/`)                    | errors listed |  fixed |   left | note                                                                  |
| -------------------------------------------------- | ------------: | -----: | -----: | --------------------------------------------------------------------- |
| `animal-presets/+page.svelte`                      |            13 |     13 |      0 | Mutable camera tuple; string control boundary conversions.            |
| `flow-fest-sim/FlowFestElectricUnicycle.svelte`    |             4 |      4 |      0 | Concrete `Group` refs.                                                |
| `flow-fest-sim/FlowFestEucMountedRider.svelte`     |             1 |      1 |      0 | Current blue/red avatar prop names.                                   |
| `flow-fest-sim/FlowFestFestivalCommunity.svelte`   |             1 |      1 |      0 | Current `characterId` performer input.                                |
| `flow-fest-sim/FlowFestForestEcology.svelte`       |             3 |      3 |      0 | Enumerate near URL entries; validate distance URLs.                   |
| `flow-fest-sim/FlowFestHeroFire.svelte`            |             1 |      1 |      0 | Bind the concrete opacity material.                                   |
| `flow-fest-sim/FlowFestPopulation.svelte`          |             2 |      2 |      0 | Current avatar inputs; scene narrowing.                               |
| `flow-fest-sim/FlowFestProductionLayer.svelte`     |             5 |      5 |      0 | Scene/renderer narrowing preserves actual runtime.                    |
| `flow-fest-site-markers/+page.svelte`              |            15 |     15 |      0 | Numeric view-state annotation; rune import suffix.                    |
| `ocean-character-lab/+page.svelte`                 |            62 |      4 |     58 | Global augmentation (3); nonempty trial list (1).                     |
| `ocean-motion-benchmark/+page.svelte`              |            20 |      7 |     13 | Global augmentation (3); pointer arity (2); canvas narrowing (2).     |
| `prop-3d-studio/+page.svelte`                      |             6 |      6 |      0 | Guaranteed fallback camera; container query `or`.                     |
| `prop-3d-studio/capture/CaptureScene.svelte`       |             4 |      4 |      0 | Generator discriminant; renderer size; scene narrowing; quality enum. |
| `prop-3d-studio/sprites/SpriteCaptureScene.svelte` |             5 |      5 |      0 | Scene/renderer narrowing; remove renderer cast.                       |
| **Total**                                          |       **142** | **71** | **71** | Inspection-based, pending coordinator full check.                     |

## RUNTIME DEFECTS

- **Observation:** The community host passed `avatarId` to `LiveSequencePerformer3D`, whose required input is `characterId` (`src/lib/shared/3d/performers/LiveSequencePerformer3D.svelte:63`, forwarded to the avatar at line 289). **Inference:** The selected character never reached its owner. Renamed the input to deliver the intended model.
- **Observation:** Rider/population hosts passed `leftPropState` / `rightPropState`; installed `@austencloud/scene-3d/src/lib/components/Avatar3D.svelte:128-129` requires `bluePropState` / `redPropState`. The intended null hand targets now use the current API. **Inference:** Previously the child received undefined rather than explicit null targets. Its implementation guards falsy targets, so no claim that this alone visibly broke idle avatars.
- **Observation:** The studio separated container conditions with a comma; replaced it with `or`, preserving thresholds and declarations. **Inference:** Browsers could ignore the invalid narrow-or-short query. No browser inspection was performed because this brief forbids a dev server.
- No new regression tests: these repairs concern component wiring and browser CSS, without independent calculations/state transitions to exercise outside a browser. Nearby existing tests were run below. Svelte compilation exercises changed syntax; it does not establish rendered behavior.
- **Observation, unresolved:** The agency page imports an absent seed function and dereferences absent perception/memory objects. Motion telemetry reads absent escape/intent state. These require a package implementation or route retirement, not invented local fields.

## ROOT CAUSES

1. **Observation:** `SegmentedControl.svelte` uses string options. Animal controls supplied booleans/numbers; boundary conversions preserve boolean/numeric scene state and existing labels.
2. **Observation:** `MIDDLE_EARTH_VIEW` is `as const`; inferred mutable state inherited literals 940/620/900. A numeric state annotation clears all 15 pan/zoom/full-view cascades without changing coordinates.
3. **Observation:** Threlte refs need the concrete bound object. Group refs now name `Group`; fire opacity animation binds `MeshBasicMaterial` directly, avoiding generic mesh/material-array ambiguity.
4. **Observation:** `src/types/global.d.ts:313-328` declares a wrapped scene/renderer and omits `size`. Installed `node_modules/@threlte/core/dist/context/compounds/useThrelte.d.ts` declares `scene: Scene`, `renderer: T`, and `size: CurrentReadable<...>`. Its sibling JS returns `rendererCtx.renderer` and `sceneCtx.scene` directly. Local `"current" in value ? value.current : value` guards accept declared wrappers and preserve installed direct-object behavior. Capture sizing uses renderer logical size via `getSize(Vector2)` for the same aspect calculation.
   - **Proposal, outside ownership:** Correct or remove the ambient `@threlte/core` augmentation in `src/types/global.d.ts`, using installed package declarations as authority. Do not change working runtime accesses to unconditional `.current`.
5. **Observation:** Global augmentation in an instance script is inside Svelte's generated instance function. Supporting types and `declare global` blocks now live in module scripts, supplying the window properties without assertions.
6. **Observation:** Broad array annotations make fixed-list indexing potentially undefined. Trial order now guarantees its first element; the camera list guarantees its first two. Runtime lists/fallback choices are unchanged.
7. **Observation:** A nested function declaration lost the guarded canvas context's narrowing. An arrow function created after the guard retains the same context and animation behavior.
8. **Observation:** Spreading the LED pattern union and overriding only `generatorId` permitted an image variant. Capture now explicitly constructs the generator variant and preserves default generator parameters when applicable. The current default is a generator (`src/lib/shared/animation-engine/domain/types/led-types.ts:224-227`), so current appearance is preserved. `QualityTier.HIGH` has the same runtime value as the old string.
9. **Observation:** The site-marker rune import now uses `.svelte.js` as required. No unlisted files were edited to repair imports.

## LEFT

- **Deletion candidate, not deleted:** `src/routes/test/ocean-character-lab/+page.svelte` (58 listed errors left). Installed `@austencloud/backgrounds` 0.7.12 lacks root `setOceanFishSimulationSeed`. `FishMarineLife` lacks `resident`, `intent`, `intentTimer`, `escapeManeuver`, `attention`, `perception`, `memory`, `escapeEventCount`; `FishBehavior` lacks `socializing`. Four errors also come from missing public animator-interface methods (below). Four independent declaration/index errors were addressed; trials were not rewritten.
- **Deletion candidate, not deleted:** `src/routes/test/ocean-motion-benchmark/+page.svelte` (13 listed errors left). `FishMarineLife` lacks `escapeSwim`, `escapeManeuver`, `intent`, `escapeEventCount`. The installed `setPointer(x, y, active)` takes three arguments. Removed only its ignored fourth argument and retained pointer-type telemetry locally. Escape telemetry cannot be derived honestly from the installed model.
- **Observation:** Existing motion-page `@ts-expect-error` on the Vite import query and existing assertions were retained. None were added to suppress errors.
- **Needs decision:** Restore the real agency/escape package implementation or retire these two routes in a separate change. This lane does neither.

## PACKAGE PROPOSALS

- **Observation:** `node_modules/@austencloud/backgrounds/package.json` reports 0.7.12. `rg` found no root seed export and no requested agency/escape fields in `dist/backgrounds/ocean/domain/models/OceanModels.d.ts`. **Proposal:** To retain these routes, restore the real runtime agency/escape implementation and its public types, including root seed export, before updating the dependency. Declarations alone would leave runtime failures. Intended field schemas cannot be established from this installed version; do not fabricate them from page accesses.
- **Observation:** `dist/backgrounds/ocean/services/implementations/FishAnimator.d.ts:47,56` and its sibling JS implement both methods below. `dist/backgrounds/ocean/services/contracts/IFishAnimator.d.ts` omits them; `OceanBackgroundOrchestrator.d.ts:111` returns that interface. **Proposal:** Add these existing implementation signatures to the package's source `IFishAnimator`, with `SpineChain` imported from `../../physics/SpineChain.js`:

  ```typescript
  getSpineChain(fish: FishMarineLife): SpineChain | undefined;
  repositionFish(fish: FishMarineLife, dx: number, dy: number): void;
  ```

  This addresses four remaining character-page errors without inventing behavior. No package files were modified.

## TESTS RUN

- **Observation:** Exact PowerShell commands: `$changed = @(git diff --name-only -- '*.ts' '*.svelte'); npx eslint $changed; npx prettier --check $changed`. ESLint exit 0: `14 problems (0 errors, 14 warnings)`. All changed Svelte files are ignored by existing `**/*.svelte` configuration; this is **not lint coverage**. Prettier exit 0: `All matched files use Prettier code style!`.
- **Observation:** `npx vitest run --config tests/config/vitest.config.ts tests/unit/prop-studio-lightweight-bootstrap.test.ts tests/unit/scene-prop-picker-contract.test.ts tests/unit/ocean-cursor-escape-capture.test.ts` -> exit 0, `Test Files 3 passed (3)`, `Tests 28 passed (28)`.
- **Observation:** `npx vitest run --config tests/config/vitest.config.ts --maxWorkers 2 tests/unit/flow-fest-electric-unicycle.test.ts tests/unit/flow-fest-euc-mounted-pose.test.ts tests/unit/flow-fest-avatar-material-repair.test.ts tests/unit/flow-fest-forest-ecology.test.ts tests/unit/flow-fest-population.test.ts tests/unit/3d-viewer/prop-studio-loop-seam-contract.test.ts` -> exit 0, `Test Files 6 passed (6)`, `Tests 126 passed (126)`.
- **Observation:** The exact PowerShell here-string below compiled all changed components in memory with no generated output files. Result: `COMPILE PASS` for all 14, exit 0. Warnings: community 2, studio page 1, capture scene 1; others 0. This checks syntax, not package exports/assignability.

```powershell
@'
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { compile } = require('svelte/compiler');
const files = execFileSync('git', ['diff', '--name-only', '--', '*.svelte'], {encoding:'utf8'}).trim().split('\n');
let failed = 0;
for (const filename of files) {
 try { const result = compile(fs.readFileSync(filename, 'utf8'), { filename, generate: 'server' }); console.log('COMPILE PASS ' + filename + ' (' + result.warnings.length + ' warnings)'); }
 catch (e) { failed++; console.log('COMPILE FAIL ' + filename + ': ' + e.message); }
}
process.exitCode = failed ? 1 : 0;
'@ | node
```

- **Observation:** `git diff --check` exited 0 with no output.
- **Not run by instruction:** svelte-check, tsc, full checks, builds, dev servers, installs, integration, push. The coordinator owns the full check on the other machine and any integration. All tracked edits are confined to the 14 listed source files plus this ledger.

## COMMITS

- `20c70f8839` fix(types): w4-testpages animal-presets (13 errors)
- `e91b86b797` fix(types): w4-testpages flow-fest-sim (17 errors)
- `8bf786ef2f` fix(types): w4-testpages flow-fest-site-markers (15 errors)
- `abff98fae1` fix(types): w4-testpages ocean-character-lab (4 errors)
- `64d8811d32` fix(types): w4-testpages ocean-motion-benchmark (7 errors)
- `3436314813` fix(types): w4-testpages prop-3d-studio (15 errors)

This ledger is committed separately with an explicit pathspec.
