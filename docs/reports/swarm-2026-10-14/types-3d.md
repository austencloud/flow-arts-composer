# Shared 3D types — swarm-2026-10-14

## Evidence and scope

Observation: branch `codex/swarm-types-3d` started clean at `d8f1a2a84d587a041294b26bfc510f3b8a4af067`. The supplied list has 124 diagnostics in 40 files.

Inference: source corrections address 122 listed diagnostics; two remain. **Fixed means intended source correction, not measured checker clearance.** The coordinator must run the full checker. No svelte-check, tsc, install, full build, app dev server, merge, rebase, reset, stash, push, primary-checkout edit, or other-worktree edit was performed.

Observation: 43 source files changed: 39 listed components plus four necessary shared roots. GhostPropHistory3D is unchanged because its errors are addressed in its called functions. Four test files were added (two unit suites, one browser suite, one rune-root helper). Temporary test-config changes were restored byte-for-byte before committing.

## File ledger

| file                                                                                     | errors listed |   fixed |  left | note                                                                                                    |
| ---------------------------------------------------------------------------------------- | ------------: | ------: | ----: | ------------------------------------------------------------------------------------------------------- |
| `src/lib/shared/3d/components/InteractiveCanvasFrameBridge.svelte`                       |             2 |       2 |     0 | Resolve scene/renderer; canvas comes from renderer.domElement.                                          |
| `src/lib/shared/3d/components/ManualRaycaster.svelte`                                    |             2 |       2 |     0 | Resolve scene/renderer.                                                                                 |
| `src/lib/shared/3d/components/StageTerrain.svelte`                                       |             5 |       5 |     0 | Resolve scene for registration and attachment lifecycle.                                                |
| `src/lib/shared/3d/components/Viewer3DScene.svelte`                                      |             8 |       6 |     2 | Resolve handles; copy light tuples; contextual TipEffectMap; live rig aliases. Two layer errors remain. |
| `src/lib/shared/3d/components/controls/SceneControlRail.svelte`                          |             2 |       2 |     0 | Discard undo/redo return values at void callback boundary.                                              |
| `src/lib/shared/3d/components/controls/character-select/CharacterCardLivePreview.svelte` |             2 |       2 |     0 | update(0) and live rig aliases; also correct unrecognized prop-type names.                              |
| `src/lib/shared/3d/diagnostics/gait/GaitProbe.svelte`                                    |             5 |       5 |     0 | Resolve scene; useScheduler supplies renderStage; infer full published diagnostic API.                  |
| `src/lib/shared/3d/effects/bubbles/BubbleEmitter3D.svelte`                               |             1 |       1 |     0 | Bind Group subtype.                                                                                     |
| `src/lib/shared/3d/effects/led/Led3D.svelte`                                             |             1 |       1 |     0 | Resolve scene.                                                                                          |
| `src/lib/shared/3d/effects/motion/GhostPropHistory3D.svelte`                             |             3 |       3 |     0 | Consumer unchanged: called pose helpers accept structural XYZ.                                          |
| `src/lib/shared/3d/effects/motion/GhostPropPhantom3D.svelte`                             |             1 |       1 |     0 | Contextual mutable position tuple.                                                                      |
| `src/lib/shared/3d/environments/components/Environment3D.svelte`                         |             6 |       6 |     0 | Resolve scene/renderer for clearing globals.                                                            |
| `src/lib/shared/3d/environments/primitives/CelestialCloudSky.svelte`                     |             1 |       1 |     0 | highContrast:false preserves prior falsy behavior.                                                      |
| `src/lib/shared/3d/environments/primitives/PlanarReflector.svelte`                       |             3 |       3 |     0 | Known ShapeGeometry position via getAttribute.                                                          |
| `src/lib/shared/3d/environments/review/EnvironmentReviewCamera.svelte`                   |             1 |       1 |     0 | Pass actual colliderMeshes prop.                                                                        |
| `src/lib/shared/3d/environments/review/EnvironmentReviewViewSource.svelte`               |             1 |       1 |     0 | Resolve handles without casts.                                                                          |
| `src/lib/shared/3d/environments/scenes/CelestialScene.svelte`                            |             1 |       1 |     0 | Map medium/default to existing standard world branch.                                                   |
| `src/lib/shared/3d/environments/scenes/CosmicScene.svelte`                               |             6 |       6 |     0 | Resolve scene/renderer; remove old cast.                                                                |
| `src/lib/shared/3d/environments/scenes/EmberScene.svelte`                                |            10 |      10 |     0 | Resolve scene/renderer; remove old cast.                                                                |
| `src/lib/shared/3d/environments/scenes/RainbowScene.svelte`                              |            10 |      10 |     0 | Resolve scene.                                                                                          |
| `src/lib/shared/3d/environments/scenes/VoidScene.svelte`                                 |             2 |       2 |     0 | Resolve scene.                                                                                          |
| `src/lib/shared/3d/environments/scenes/WinterScene.svelte`                               |            12 |      12 |     0 | Resolve scene/renderer.                                                                                 |
| `src/lib/shared/3d/environments/scenes/celestial/CelestialSanctuaries.svelte`            |             2 |       2 |     0 | Narrow all manifest XYZ coordinates.                                                                    |
| `src/lib/shared/3d/environments/scenes/celestial/CloudbreakWaterfall.svelte`             |             2 |       2 |     0 | Retain typed uniform handles.                                                                           |
| `src/lib/shared/3d/environments/scenes/cosmic/CrystalFormations.svelte`                  |             1 |       1 |     0 | Empty labels fallback for absent bucket; construction aligns buckets.                                   |
| `src/lib/shared/3d/environments/scenes/cosmic/MeteorStreaks.svelte`                      |             1 |       1 |     0 | Guard selected meteor; current pool always has five entries.                                            |
| `src/lib/shared/3d/environments/scenes/ember/EmberGroundDetail.svelte`                   |             1 |       1 |     0 | Resolve renderer.                                                                                       |
| `src/lib/shared/3d/environments/scenes/ember/EmberSurfaceEcology.svelte`                 |             1 |       1 |     0 | Resolve scene.                                                                                          |
| `src/lib/shared/3d/environments/scenes/ember/LavaRivers.svelte`                          |             1 |       1 |     0 | Remove obsolete derivatives extension; installed renderer is WebGL2-only.                               |
| `src/lib/shared/3d/environments/scenes/ember/ObsidianPlatform.svelte`                    |             3 |       3 |     0 | Known CircleGeometry position via getAttribute.                                                         |
| `src/lib/shared/3d/environments/scenes/forest/ForestCanopyFlight.svelte`                 |             1 |       1 |     0 | Seven-number authored tuples using satisfies.                                                           |
| `src/lib/shared/3d/environments/scenes/forest/ForestConfigurableScene.svelte`            |             3 |       3 |     0 | Resolve scene.                                                                                          |
| `src/lib/shared/3d/environments/scenes/forest/ForestGroundDetail.svelte`                 |             5 |       5 |     0 | Resolve renderer and ancestor scene scope.                                                              |
| `src/lib/shared/3d/environments/scenes/forest/ForestLighting.svelte`                     |             2 |       2 |     0 | Resolve scene.                                                                                          |
| `src/lib/shared/3d/environments/scenes/forest/ForestProductionScene.svelte`              |             7 |       7 |     0 | Resolve scene/renderer.                                                                                 |
| `src/lib/shared/3d/environments/scenes/winter/graybox/WinterFireCourtAudience.svelte`    |             1 |       1 |     0 | Use bluePropState/redPropState; values remain null.                                                     |
| `src/lib/shared/3d/performers/ContactIsolationPerformer.svelte`                          |             2 |       2 |     0 | Live rig aliases; numeric isolation length.                                                             |
| `src/lib/shared/3d/performers/LiveSequencePerformer3D.svelte`                            |             2 |       2 |     0 | Live rig aliases; convert quality strings to enum values.                                               |
| `src/lib/shared/3d/procedural-engine/components/WorldSceneContent.svelte`                |             1 |       1 |     0 | Pass bluePropState/redPropState to Avatar3D.                                                            |
| `src/lib/shared/3d/worker-renderer/components/WorkerPerformerMoveHint.svelte`            |             3 |       3 |     0 | Guard null projection; narrow consumed bridge methods.                                                  |
| **Total**                                                                                |       **124** | **122** | **2** | Requires coordinator confirmation.                                                                      |

Additional shared roots have zero listed diagnostics; their effects are counted only at consumers:

- `scene-boot/threlte-handles.ts`: extend the existing resolver with cast-free scene/renderer union narrowing, and remove existing casts from the handles resolver.
- `state/character-instance-state.svelte.ts`: live blue/red prop getters and a derived plane-override map carrying both naming conventions. Stored state and snapshots retain left/right names.
- `effects/motion/ghost-prop-pose-3d.ts`: accept `Pick<Vector3, "x" | "y" | "z">` because the center is only read by coordinate.
- `performers/staff-isolation.ts`: annotate length as number, preserving the default 0.9.

## RUNTIME DEFECTS

Observation from source, not live 3D visual proof:

1. `worker-renderer/services/worker-performer-interaction.ts`, projectStagePosition around line 339, returns null before a camera arrives or when the surface has no size. MoveHint dereferenced it while its hint was active. It now waits for a projection. The browser regression covers null, an arriving projection, rendered x-coordinate, and placement suppression.
2. Installed `node_modules/@austencloud/scene-3d/src/lib/components/PerformerRig.svelte` reads avatarState.bluePropState/redPropState around line 305 and blue/red plane overrides around line 330. Character state exposed left/right only. The preview depended on those defaults, so animated props could disappear; per-beat turn headings could use wall-plane defaults. Live getters and a derived compatible map now bridge the boundary. A new unit regression covers load, seek, plane overrides, and clear.
3. WorldSceneContent supplied unrecognized leftPropState/rightPropState to Avatar3D, so the avatar could miss sequence hand poses while separate props rendered. It now supplies bluePropState/redPropState. Winter audience uses the recognized names too; its values stay null.
4. CharacterCardLivePreview supplied unrecognized leftPropType/rightPropType, allowing package defaults to replace the chosen prop. It now supplies bluePropType/redPropType. CameraControls.update now receives initial delta 0.
5. EnvironmentReviewCamera passed collisionMeshes, while the shared OrbitControls Props declares colliderMeshes and consumes that value. It now passes colliderMeshes so review orbit receives authored collision surfaces.

The last three boundaries require full WebGL scenes for visual confirmation. No live app preview was started because the brief forbids dev servers. Existing related logic/contract suites passed, and all changed components compiled; those checks do not prove final 3D appearance.

## ROOT CAUSES

- Observation: `src/types/global.d.ts:312-329` declares wrapped scene/renderer and omits canvas/renderStage. Installed `@threlte/core` 8.3.1, in `dist/context/compounds/useThrelte.d.ts`, declares direct scene/renderer; camera alone is a current holder. This accounts for 80 listed errors. A shared `"current" in value` guard preserves both runtime shapes. Adding .current unconditionally would break the installed runtime. Canvas comes from renderer.domElement; renderStage comes from useScheduler.
- Observation: app hand naming and the scene package disagree. Four AvatarInstanceState assignments share one state root. Adding only prop aliases would expose a further incompatible plane map; both were corrected together.
- Observation: strict indexed access makes unbounded arrays and attribute/uniform dictionaries optional. Tuple context, exact uniform handles, known geometry getters, and honest guards retain authored values.
- Observation: readonly tuples, string enums, and conditional map literals need explicit boundary types. Tuple copies, enum conversion, and a contextual TipEffectMap preserve runtime values.
- Observation: installed Three.js WebGLRenderer documents WebGL2-only support (`node_modules/three/src/renderers/WebGLRenderer.js:61-63`); ShaderMaterial.extensions no longer includes derivatives. Removing the obsolete flag preserves shader derivative availability.

Owner search: rg for threlte/context-value and canonical-capabilities found the existing shared scene-boot handles owner, a camera package resolver, and a museum-local resolver. Decision: extend the shared owner; do not add a parallel stack or edit package/museum sources.

## LEFT

- Viewer3DScene original lines 658 and 722: two layers={PERFORMER_LAYERS} diagnostics. Installed extras `dist/layers/types.d.ts` supports arrays; `dist/layers/plugin.svelte.js` enables every requested layer and propagates context to descendants. Core `dist/components/T/types.d.ts` derives native Layers.set's single-number/single-element-tuple type. Reducing the array to one layer would change compositing/inheritance. No cast, suppression, or runtime behavior change was used to conceal this mismatch.

## PACKAGE PROPOSALS

Proposals only; packages/\*\* and node_modules were not edited:

1. Threlte dependency typing: core `dist/components/T/types.d.ts` currently intersects InstanceProps<Type> and Threlte.UserProps. A supported plugin override must replace the native key, for example `Omit<InstanceProps<Type>, keyof Threlte.UserProps> & Threlte.UserProps`, and extras must register `layers?: ThrelteLayers` through that mechanism. Merely intersecting a layers augmentation still leaves the native restriction. Preserve extras runtime array/inheritance behavior. This is the dependency-level proposal for LEFT, not an installed-package patch.
2. @austencloud/scene-3d: migrate PerformerRig's AvatarInstanceState and heading lookups together from blue/red to left/right, or document both aliases as supported API. Implemented local aliases make that package migration unnecessary for these commits.

Out-of-scope app proposal: remove the inaccurate `declare module "@threlte/core"` block at `src/types/global.d.ts:313-329`, letting upstream describe its context. Review bare ThrelteContext imports for the upstream generic parameter during that change. This file is outside lane ownership; local guards work without its removal.

## TESTS RUN

Observation: runner-generated files were confined to owned tests/.cache/types-3d using temporary cacheDir and SvelteKit plugin `outDir: "tests/.cache/types-3d/kit"`. Browser API used `test.browser.api: { host: "127.0.0.1", port: 5247 }`. Native/runner loaders avoided temporary config output through the shared node_modules junction. Both configs were restored byte-for-byte. All test processes ended; 5247 had no listener. Ignored caches/logs remain under tests/.cache/types-3d.

Invocation A used the 61 paths in the manifest below:

```powershell
$relatedTests = @(Get-Content tests/.cache/types-3d/associated-tests.txt)
npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 $relatedTests
# Test Files  1 failed | 60 passed (61)
# Tests       1 failed | 459 passed | 1 todo (461)
# Exit 1
```

Observation: A began while state/test edits were being finalized. Its only failure was the new plane-alias assertion, receiving left/right without blue/red. Inference: A had loaded the earlier state transform. B reran all 34 affected suites against final stable source, including that exact regression:

```powershell
$finalStateTests = @(Get-Content tests/.cache/types-3d/final-state-tests.txt)
npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 $finalStateTests
# Test Files  34 passed (34)
# Tests       235 passed | 1 todo (236)
# Exit 0
```

This committed manifest reconstructs both ignored path-list files. A/B marks membership. Per-file passing status is inferred from the aggregate results and A's sole named failure; the default reporter did not print passing suite lines.

| test path                                                                      | invocation | final result |
| ------------------------------------------------------------------------------ | ---------- | ------------ |
| `tests/unit/3d-animation/authored-contact-pose.test.ts`                        | A          | A passed     |
| `tests/unit/3d-animation/prop-continuity-audit.test.ts`                        | A, B       | B passed     |
| `tests/unit/3d-animation/relaxed-contact-grip.test.ts`                         | A          | A passed     |
| `tests/unit/3d-animation/staff-grip-contact-contract.test.ts`                  | A, B       | B passed     |
| `tests/unit/3d-animation/staff-isolation-authority.test.ts`                    | A          | A passed     |
| `tests/unit/3d-animation/visible-staff-grasp.test.ts`                          | A          | A passed     |
| `tests/unit/3d-autumn/autumn-retained-runtime-source.test.ts`                  | A          | A passed     |
| `tests/unit/3d-effects/ghost-chrono-frost-3d.test.ts`                          | A          | A passed     |
| `tests/unit/3d-viewer/celestial-asset-catalog.test.ts`                         | A          | A passed     |
| `tests/unit/3d-viewer/character-ephemeral-persistence.test.ts`                 | A, B       | B passed     |
| `tests/unit/3d-viewer/character-preview-source.test.ts`                        | A, B       | B passed     |
| `tests/unit/3d-viewer/character-terminology-contract.test.ts`                  | A, B       | B passed     |
| `tests/unit/3d-viewer/ember-ground-detail.test.ts`                             | A          | A passed     |
| `tests/unit/3d-viewer/forest-cloud-sky.test.ts`                                | A          | A passed     |
| `tests/unit/3d-viewer/forest-ground-detail.test.ts`                            | A          | A passed     |
| `tests/unit/3d-viewer/olive-cloudbreak-production.test.ts`                     | A          | A passed     |
| `tests/unit/3d-viewer/performer-grid-join-override.test.ts`                    | A, B       | B passed     |
| `tests/unit/3d-viewer/performer-light-pool.test.ts`                            | A, B       | B passed     |
| `tests/unit/3d-viewer/threlte-scene-handles.test.ts`                           | A          | A passed     |
| `tests/unit/3d-viewer/viewer3d-effects-slot-contract.test.ts`                  | A, B       | B passed     |
| `tests/unit/3d-viewer/viewer3d-integration-observer.test.ts`                   | A, B       | B passed     |
| `tests/unit/3d-worker-renderer/celestial-adapter-contract.test.ts`             | A          | A passed     |
| `tests/unit/3d-worker-renderer/cosmic-environment-world.test.ts`               | A          | A passed     |
| `tests/unit/3d-worker-renderer/ember-environment-world-parity.test.ts`         | A          | A passed     |
| `tests/unit/3d-worker-renderer/ember-shared-adapter-contract.test.ts`          | A, B       | B passed     |
| `tests/unit/3d-worker-renderer/forest-shared-adapter-contract.test.ts`         | A          | A passed     |
| `tests/unit/3d-worker-renderer/winter-scene-parity-contract.test.ts`           | A          | A passed     |
| `tests/unit/3d-worker-renderer/worker-imperative-effect-frame-builder.test.ts` | A          | A passed     |
| `tests/unit/3d-worker-renderer/worker-performer-contact.test.ts`               | A, B       | B passed     |
| `tests/unit/3d-worker-renderer/worker-performer-snapshot.test.ts`              | A, B       | B passed     |
| `tests/unit/3d-worker-renderer/worker-snapshot-transfer-contract.test.ts`      | A, B       | B passed     |
| `tests/unit/3d-worker-renderer/worker-viewer-snapshot.test.ts`                 | A, B       | B passed     |
| `tests/unit/3d/body-clearance.test.ts`                                         | A, B       | B passed     |
| `tests/unit/3d/ember-production-slice-contract.test.ts`                        | A, B       | B passed     |
| `tests/unit/3d/ember-volcanic-atmosphere.test.ts`                              | A, B       | B passed     |
| `tests/unit/3d/grid-join-motion.test.ts`                                       | A, B       | B passed     |
| `tests/unit/3d/hard-beat-displacement.test.ts`                                 | A, B       | B passed     |
| `tests/unit/3d/lava-river-geometry.test.ts`                                    | A          | A passed     |
| `tests/unit/3d/performer-contact-displacement.test.ts`                         | A, B       | B passed     |
| `tests/unit/3d/performer-hand-distance.test.ts`                                | A, B       | B passed     |
| `tests/unit/3d/performer-upper-body-stance.test.ts`                            | A, B       | B passed     |
| `tests/unit/3d/stage-coordinate-frame.test.ts`                                 | A          | A passed     |
| `tests/unit/3d/state/character-instance-rig-hands.test.ts`                     | A, B       | B passed     |
| `tests/unit/3d/state/character-instance-state-live-phase.test.ts`              | A, B       | B passed     |
| `tests/unit/3d/state/character-instance-state-per-performer-effort.test.ts`    | A, B       | B passed     |
| `tests/unit/3d/state/character-instance-state-settings.test.ts`                | A, B       | B passed     |
| `tests/unit/collision-lab/staff-turn-preparation-study.test.ts`                | A, B       | B passed     |
| `tests/unit/effects/scene-effects-batching-contract.test.ts`                   | A, B       | B passed     |
| `tests/unit/effects/translators/webgl3d-translator.test.ts`                    | A          | A passed     |
| `tests/unit/museum/museum-rendering-performance-contract.test.ts`              | A          | A passed     |
| `tests/unit/negative-space-reach/isolation-production-path.test.ts`            | A, B       | B passed     |
| `tests/unit/negative-space-reach/isolation-teaching.test.ts`                   | A          | A passed     |
| `tests/unit/prop-studio-lightweight-bootstrap.test.ts`                         | A, B       | B passed     |
| `tests/unit/scene-boot/scene-asset-manifest-contract.test.ts`                  | A          | A passed     |
| `tests/unit/scene-boot/scene-module-prefetch-contract.test.ts`                 | A          | A passed     |
| `tests/unit/scene-prop-picker-contract.test.ts`                                | A, B       | B passed     |
| `tests/unit/stage/stage-module-contract.test.ts`                               | A, B       | B passed     |
| `tests/unit/viewer-3d-workbench-bootstrap.test.ts`                             | A          | A passed     |
| `tests/unit/viewer-orchestrator-decomposition-contract.test.ts`                | A, B       | B passed     |
| `tests/unit/viewer3d-intro-state.test.ts`                                      | A          | A passed     |
| `tests/unit/worker-renderer/worker-selection-marker.test.ts`                   | A, B       | B passed     |

Closest review/gait suites:

```powershell
npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 tests/unit/3d-viewer/environment-review-camera.test.ts tests/unit/3d-autumn/environment-review-view-source.test.ts tests/unit/3d/gait-analysis.test.ts
# Test Files  3 passed (3)
# Tests       28 passed (28)
# Exit 0
```

Browser regression:

```powershell
npx vitest run --config tests/config/vitest.components.config.ts --configLoader runner --no-cache --maxWorkers 1 src/lib/shared/3d/worker-renderer/components/WorkerPerformerMoveHint.svelte.test.ts
# Test Files  1 passed (1)
# Tests       1 passed (1)
# Exit 0
```

Earlier attempts, resolved: temporary outDir was initially under kit and rejected before tests; installed SvelteKit requires outDir directly on the plugin. The first browser attempt configured only the outer API and failed EACCES on the browser API's default ::1:63315; test.browser.api on IPv4 fixed it. An initial new test assumed a seek changed fixture XYZ; those coordinates matched, so the regression now checks a replaced live state object and explicit plane aliases. Existing Three.js multiple-instance warnings appeared in unit runs.

Lint/format inputs were all 47 authored code/test paths (the union of paths in the implementation commits):

```powershell
$changedCode = @(Get-Content tests/.cache/types-3d/changed-code.txt)
npx eslint $changedCode
# 42 problems (0 errors, 42 warnings)
# Exit 0
npx prettier --check $changedCode
# All matched files use Prettier code style!
# Exit 0
```

Observation: eslint.config.js globally ignores .svelte and tests/. Thus eslint verifies applicable TypeScript sources; its 42 ignored-file warnings were not suppressed. Prettier checked all authored code/test files.

Changed-component compile used the existing gate export in memory, before committing when git diff selected the files:

```powershell
@'
import { execFileSync } from 'node:child_process';
import { compileSvelteFiles } from './scripts/svelte-compile-gate.mjs';
const paths = execFileSync('git', ['diff', '--name-only', '--', 'src/lib/shared/3d'], { encoding: 'utf8' }).trim().split('\n').filter(path => path.endsWith('.svelte'));
const results = await compileSvelteFiles(paths);
const errors = results.flatMap(result => result.errors.map(error => ({file: result.file, ...error})));
console.log(JSON.stringify(errors));
console.log(`Svelte compile: ${results.length} files, ${errors.length} errors, ${results.reduce((sum, result) => sum + result.warnings.length, 0)} warnings`);
process.exitCode = errors.length ? 1 : 0;
'@ | node --input-type=module
# []
# Svelte compile: 39 files, 0 errors, 0 warnings
# Exit 0
```

Observation: this was not a full build or a type check. Native Vite config extension warnings appeared while loading the project preprocessors; no component diagnostic was emitted.

Final checks: git diff --check exited 0. `git diff --exit-code -- tests/config/vitest.config.ts tests/config/vitest.components.config.ts` exited 0 after restoration. Full type checking was not run, as required.

## Implementation commits

- `efe7af0ed8ca67b70ae7025785177475c4550035` — fix(types): 3d scene boot and performer state (4 errors)
- `19ff32c320e34cd884a5a56ee4624052a88be15e` — fix(types): 3d components (17 errors)
- `5e8e2de131d0d9aec6968b81bf8d5c78a8b417e3` — fix(types): 3d diagnostics (5 errors)
- `cd6235653e36f9611ddfda225b7911f03bf28048` — fix(types): 3d effects (6 errors)
- `653a50b147d1ee216ed0f14bcd55dba2cc11998e` — fix(types): 3d environments (84 errors)
- `c84f256dece51be33e4219c7edfc2df5a5c232f4` — fix(types): 3d performers (2 errors)
- `f057bccaaf2357fbbe441b5368fac52119b6e4ce` — fix(types): 3d procedural engine (1 error)
- `391da0c0d0c8709ebd9804b9a0d03dbf077f97e1` — fix(types): 3d worker renderer (3 errors)

## Deviations and delivery

Observation: two errors remain for dependency typing; full checker clearance is unmeasured by design. No app preview or main integration was attempted because the brief forbids dev servers, the primary checkout, and merges. Commits stay on the assigned branch for coordinator integration. Temporary test config changes were verification-only and are not committed. No Austen decision or approval is needed for completed owned work.
