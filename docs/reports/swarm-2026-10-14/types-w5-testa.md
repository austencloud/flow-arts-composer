# types-w5-testa ledger

Date: 2026-10-18. Branch: `codex/swarm-types-w5-testa`.
Worktree: `E:/worktrees/tka-platform/swarm-w5-testa`.
Starting commit: `2841631dcff0139d4bb8fc80cfc7a12dc34a4ac3`.

**Observation:** The supplied list contains 82 diagnostics in 28 files across 18 route directories. All 28 listed files were changed; no shared source or package source was changed. No merge, push, installation, full type check, build, or dev server was run. The branch is intentionally left for the coordinator to integrate.

**Inference:** The edits address all 82 supplied diagnostics by comparison with the current declarations. The `fixed` column means addressed by source/type inspection, not independently confirmed by svelte-check. The coordinator's full check remains necessary; this lane was explicitly prohibited from running it.

All table paths are relative to `src/routes/test/`.

| file                                                         | errors listed |  fixed |  left | note                                                                                                      |
| ------------------------------------------------------------ | ------------: | -----: | ----: | --------------------------------------------------------------------------------------------------------- |
| `autumn-scene/+page.svelte`                                  |             1 |      1 |     0 | Clone the read-only query as URLSearchParams using its search string.                                     |
| `celestial-asset-catalog/CloudbreakAssetCatalogScene.svelte` |             4 |      4 |     0 | Use useScene(), whose scene is the live Three Scene.                                                      |
| `celestial-asset-catalog/+page.svelte`                       |             1 |      1 |     0 | Copy readonly options at the mutable component boundary.                                                  |
| `character-playground/CharacterPlayground.svelte`            |             1 |      1 |     0 | Narrow the nullable primary performer index before indexing.                                              |
| `coal-3d-showcase/+page.svelte`                              |             1 |      1 |     0 | Resolve optional dynamic/static preset patches and guard a missing patch.                                 |
| `construct-solo-handoff/proposal/+page.svelte`               |             1 |      1 |     0 | Use the current stepNumberOverride prop.                                                                  |
| `drowned-gallery-graybox/DrownedGalleryWalkScene.svelte`     |             1 |      1 |     0 | Normalize an absent face URI to the supported null value.                                                 |
| `element-motifs/+page.svelte`                                |            11 |     11 |     0 | Guard an empty motif roster; read registration.meta.label; adapt three boolean controls to string values. |
| `fire-lab/FireLabScene.svelte`                               |             1 |      1 |     0 | Preserve Vector3 with satisfies FireTipInput[]; replace existing any context casts with typed hooks.      |
| `first-fire-floor-plan/FirstFirePlanMap.svelte`              |             2 |      2 |     0 | Occluders now only have kind rock-rib; retain the existing rock radius and title.                         |
| `first-fire-graybox/FirstFireEmberDressing.svelte`           |             1 |      1 |     0 | Provide canonical ember crust coverage to the river shader.                                               |
| `first-fire-graybox/FirstFireCoalDressing.svelte`            |             1 |      1 |     0 | Narrow both segment endpoints before tuple destructuring.                                                 |
| `first-fire-graybox/FirstFireGrayboxWalkScene.svelte`        |             5 |      5 |     0 | Declare numeric position state; obtain the canvas directly from useDOM().                                 |
| `first-fire-lookdev/FirstFireCoalLookdev.svelte`             |             1 |      1 |     0 | Obtain the size store from useDOM().                                                                      |
| `first-fire-lookdev/+page.svelte`                            |             1 |      1 |     0 | Configure exposure on WebGLRenderer through createRenderer.                                               |
| `flow-fest-euc-pose/FlowFestEucPoseStage.svelte`             |             1 |      1 |     0 | Use the optional undefined camera ref expected by Threlte.                                                |
| `flow-fest-euc-pose/+page.svelte`                            |             2 |      2 |     0 | Clone query through its string; configure renderer exposure.                                              |
| `flow-fest-euc-ride/FlowFestEucRideStage.svelte`             |             2 |      2 |     0 | Use optional undefined camera and light refs.                                                             |
| `flow-fest-euc-ride/+page.svelte`                            |             1 |      1 |     0 | Configure renderer exposure through createRenderer.                                                       |
| `flow-fest-graybox/FlowFestOnFootPlayer.svelte`              |             1 |      1 |     0 | Remove obsolete left/right prop names; existing blue/red null props remain.                               |
| `flow-fest-graybox/FlowFestGrayboxWalkScene.svelte`          |             6 |      6 |     0 | Use the exported drive frame type and normalize an absent enable flag to false.                           |
| `flow-fest-native-export/native-capture.ts`                  |             4 |      4 |     0 | Collect honestly narrowed SkinnedMesh instances; narrow the one parented root once.                       |
| `flow-fest-native-export/NativeCaptureScene.svelte`          |             1 |      1 |     0 | Obtain autoRenderTask from useRenderer().                                                                 |
| `flow-fest-native-export/NativeRideScene.svelte`             |             1 |      1 |     0 | Supply required bluePropState/redPropState null props.                                                    |
| `flow-fest-native-export/+page.svelte`                       |             3 |      3 |     0 | Declare the filtered family array as PropType[]; membership remains the runtime guard.                    |
| `flow-fest-path-tracer/+page.svelte`                         |            10 |     10 |     0 | Declare mutable numeric view geometry instead of inferring literal coordinates.                           |
| `forest-scene/ForestCompositionPlan.svelte`                  |             6 |      6 |     0 | Normalize JSON coordinate arrays through the existing point() function.                                   |
| `ghost-presets/+page.svelte`                                 |            11 |     11 |     0 | Declare mutable camera tuples; adapt boolean/numeric controls at the string-only UI boundary.             |
| **Total**                                                    |        **82** | **82** | **0** | Full type-check confirmation pending coordinator.                                                         |

## RUNTIME DEFECTS

These are source-established wiring defects; no browser observations are claimed.

- **Observation:** `element-motifs/+page.svelte:53` previously read a nonexistent registration `label`, so known effects fell back to their raw IDs. `EffectRegistration` in `src/lib/shared/animation-engine/components/effects-panel/effect-registry.ts` puts that label under `meta`. The page now uses `meta.label`.
- **Observation:** `construct-solo-handoff/proposal/+page.svelte:241` passed the unsupported `showStepNumber` prop. `PictographContainer.svelte:246` exposes `stepNumberOverride`, so the old false value did not override the global display setting. The current prop now hides step numbers as requested by this caller.
- **Observation:** `first-fire-graybox/FirstFireEmberDressing.svelte:160` now passes `crustCoverage`. Previously the shader update in `src/lib/shared/3d/environments/scenes/ember/LavaRivers.svelte:639` assigned the missing property to its numeric uniform. It now receives the canonical ember configuration value, with zero (the shader's initial uniform value at line 500) if the optional river configuration is absent.
- **Observation:** Installed Threlte 8.3.1's `Canvas.svelte` forwards context options, and its renderer context never reads a `toneMappingExposure` option. The two EUC harnesses' authored 1.15 exposure was ignored. `flow-fest-euc-pose/+page.svelte:151` and `flow-fest-euc-ride/+page.svelte:99` now set that value on the renderer. The lookdev page similarly sets its authored value of 1. Renderer creation preserves Threlte's existing canvas, high-performance, antialias, and alpha options. **Inference:** The EUC stages will now reflect their authored exposure; this intentional defect correction can alter brightness and needs coordinator browser review.

The above fixes live in component wiring or a WebGL shader path and were not exercised in a browser (this lane forbids starting a dev server and using another checkout). No source-text assertion was added as a substitute for observing those paths. The non-browser capture selection/narrowing refactor has four focused tests covering the fullest skin, unweighted ancestors, world scale, pedal transforms, empty/multiple roots, and missing skins.

## ROOT CAUSES

- **Observation:** `src/types/global.d.ts:313-328` supplies an outdated `useThrelte()` overload with wrapped scene/renderer and no size/autoRenderTask. Installed hooks expose the actual contexts: `useScene()` returns a Three Scene, `useDOM()` returns size/canvas, and `useRenderer()` returns autoRenderTask. Callers now use those existing APIs, without changing the shared declaration or asserting a wider context. The fire-lab file's two existing any casts were removed at this boundary.
- **Observation:** `src/lib/shared/ui/components/SegmentedControl.svelte:1` constrains its generic to string; its options array is mutable. Boolean/numeric state stays boolean/numeric; only control inputs/outputs are converted. Catalog readonly options are copied rather than changing the shared component.
- **Observation:** Spawn/view objects came from `as const` fixtures. Explicit numeric state types permit the existing movement, pan, and zoom behavior without changing any coordinate values.
- **Observation:** Imported forest JSON arrays have `number[]` types. Existing `point()` normalization supplies tuples for section samples, footprints, and the shelf center; current complete coordinates remain unchanged. First Fire segment endpoints and optional values are narrowed before use.
- **Observation:** TypeScript does not incorporate assignments made by Three's traversal callback into outer control-flow narrowing. `native-capture.ts:118` collects actual `SkinnedMesh` instances before choosing the greatest bone count; both capture paths share it. Root-bone checks narrow one tuple element once, preserving the existing rejection for zero/multiple roots.
- **Observation:** API drift affected registration metadata, pictograph overrides, avatar blue/red prop names, drive-frame fields, optional presets, Canvas options, and component refs. Callers were updated to the published signatures.

## LEFT

- **Observation:** No supplied diagnostic was intentionally left unresolved; no missing-symbol deletion candidates were found.
- **Observation:** Full type checking and browser verification remain unrun by explicit swarm restriction. The 82 figure is an inspection-based expectation, not an observed checker delta.
- **Observation:** Supplemental Svelte-aware ESLint initially reported 35 errors and 1 warning. Baseline comparison using `git show HEAD:<path>` and `ESLint.lintText` established `baseline 35 errors; current 35 errors; added 0 errors`. These concern preexisting unkeyed each blocks, mutable Map/Set/URLSearchParams lint preferences, a bare expression, and two fire-lab any casts. The casts were subsequently replaced by typed hooks and that file passed the supplemental lint check. The remaining preexisting issues are outside this type-error lane; the exact final supplemental count is recorded below.

## PACKAGE PROPOSALS

- **Observation:** None. The installed package APIs suffice for this lane; no files under `packages/**` were modified.
- **Proposal (shared source, separate lane):** Retire the obsolete `declare module "@threlte/core"` context/overload block in `src/types/global.d.ts:313-328` so the installed package's actual context declaration is used. Audit callers that assume wrapped scene/renderer before applying that change. This lane instead uses the existing typed fragment hooks.

## TESTS RUN

All focused tests use `tests/config/vitest.config.ts` (jsdom) and disable file parallelism/cache. No component-browser tests were added or run. The two focused runs total 16 passing files and 139 passing tests.

```powershell
npx vitest run --config tests/config/vitest.config.ts --no-cache --no-file-parallelism tests/unit/unreal/native-capture.test.ts tests/unit/3d-autumn/autumn-retained-runtime-source.test.ts tests/unit/3d-viewer/celestial-asset-catalog.test.ts tests/unit/character-playground-generation-options.test.ts tests/unit/construct-solo-proposal.test.ts tests/unit/museum/museum-player-physics.test.ts tests/unit/museum/first-fire-graybox-colliders.test.ts tests/unit/museum/first-fire-procession-plan.test.ts tests/unit/flow-fest-euc-mounted-pose.test.ts tests/unit/flow-fest-path-trace.test.ts tests/unit/flow-fest-lower-layout.test.ts tests/unit/effects/ghost-review-presets.test.ts
```

Observed exit 0:

```text
Test Files  12 passed (12)
     Tests  120 passed (120)
```

```powershell
npx vitest run --config tests/config/vitest.config.ts --no-cache --no-file-parallelism tests/unit/flow-fest-frame-tasks.test.ts tests/unit/construct-solo-review-fixture.test.ts tests/unit/museum/first-fire-graybox-review.test.ts tests/unit/museum/drowned-gallery-graybox-colliders.test.ts
```

Observed exit 0:

```text
Test Files  4 passed (4)
     Tests  19 passed (19)
```

Other verification:

```powershell
$changed = @(git diff --name-only -- '*.ts' '*.svelte')
npx eslint @changed tests/unit/unreal/native-capture.test.ts
npx prettier --check @changed tests/unit/unreal/native-capture.test.ts
npx eslint --config src/routes/test/construct-solo-handoff/eslint-authoring.config.mjs @changed tests/unit/unreal/native-capture.test.ts
npx eslint --config src/routes/test/construct-solo-handoff/eslint-authoring.config.mjs src/routes/test/fire-lab/FireLabScene.svelte tests/unit/unreal/native-capture.test.ts
git diff --check
```

Here `$changed` was the 28 listed files before they were committed; the new regression file was supplied explicitly. The default ESLint configuration ignores Svelte files and tests, so its exit status is not component lint coverage. Prettier initially failed on the 28 files, then those owned files were formatted with `npx prettier --write`. No unrelated file was formatted.

A `node --input-type=module -` command passed every changed Svelte file to `compile(source, {filename, generate: false})` from `svelte/compiler`: `Svelte compiler: 27 components parsed; 0 errors; 9 warnings.` After the final fire-lab edit it was parsed again: `FireLabScene Svelte compiler: 0 errors; 0 warnings.` This is syntax compilation, not a type check.

Final lint/format/policy results and commit evidence follow below.

### Final results

- **Observation:** Required default `npx eslint @changed tests/unit/unreal/native-capture.test.ts` exited 0: `29 problems (0 errors, 29 warnings)`. Of these warnings, 28 are ignored files (27 Svelte components and the test); one is an existing optional-chain preference in `native-capture.ts:140`.
- **Observation:** Final supplemental `npx eslint --config src/routes/test/construct-solo-handoff/eslint-authoring.config.mjs @changed tests/unit/unreal/native-capture.test.ts` exited 1: `34 problems (33 errors, 1 warning)`. Baseline had 35 errors; the two removed fire-lab any casts explain the reduction. No new lint error category or instance was introduced, as established by baseline comparison before the two removals and a passing focused check afterward.
- **Observation:** The supplemental command limited to `src/routes/test/fire-lab/FireLabScene.svelte tests/unit/unreal/native-capture.test.ts` exited 0 with no findings.
- **Observation:** Final `npx prettier --check @changed tests/unit/unreal/native-capture.test.ts docs/reports/swarm-2026-10-14/types-w5-testa.md` printed `All matched files use Prettier code style!` and exited 0 after formatting the ledger as well.
- **Observation:** `git diff --check` exited 0. An added-line scan for any, TypeScript suppressions, and unknown casts printed `Added-line suppression/any/unknown-cast scan: 0 suspect lines.` No new non-null assertion was used to fix a listed error.
- **Observation:** Before every source commit, `git status --short` was read and its paths checked against the 30 owned paths; each check found zero unowned paths. Every `git add` and `git commit` received explicit file paths. The sole new test was committed with flow-fest-native-export.

## COMMIT EVIDENCE

The following source commits are observed in this branch, oldest first. The ledger is committed separately afterward.

```text
991186c28d fix(types): w5-testa autumn-scene (1 errors)
cdb1540a8a fix(types): w5-testa celestial-asset-catalog (5 errors)
a8470822a4 fix(types): w5-testa character-playground (1 errors)
9300a54c81 fix(types): w5-testa coal-3d-showcase (1 errors)
96b573b0fa fix(types): w5-testa construct-solo-handoff (1 errors)
837d80052f fix(types): w5-testa drowned-gallery-graybox (1 errors)
f460d8f3d6 fix(types): w5-testa element-motifs (11 errors)
b8c4a0622f fix(types): w5-testa fire-lab (1 errors)
82067695ce fix(types): w5-testa first-fire-floor-plan (2 errors)
d884ccf2b1 fix(types): w5-testa first-fire-graybox (7 errors)
8d33ca9408 fix(types): w5-testa first-fire-lookdev (2 errors)
9ab55e50f7 fix(types): w5-testa flow-fest-euc-pose (3 errors)
b4a4345119 fix(types): w5-testa flow-fest-euc-ride (3 errors)
b1d379d0f1 fix(types): w5-testa flow-fest-graybox (7 errors)
eaae7833cb fix(types): w5-testa flow-fest-native-export (9 errors)
5617a436d6 fix(types): w5-testa flow-fest-path-tracer (10 errors)
f55d6702d2 fix(types): w5-testa forest-scene (6 errors)
48e5bc2a59 fix(types): w5-testa ghost-presets (11 errors)
```
