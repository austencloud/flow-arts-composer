# Feature type lane, wave 4

Date: 2026-10-15. Branch: `codex/swarm-types-w4-features`.
Base observed at start: `355fbd527002109e947e18d055f45941580c3646`.

**Observation:** the initial worktree was clean. All edits are within the owned feature paths, regression tests, and this ledger. No merge, push, install, dev server, tsc, svelte-check, full check, or build was run. Delivery is committed on the worker branch for coordinator integration; nothing was integrated into main.

**Inference from code inspection:** 44 of 51 listed diagnostics are addressed; 7 remain. This is not a measured full-check reduction: the coordinator must run the full checker on the committed branch. The unchanged parent files below are cleared by root-contract changes in owned feature files.

All file entries below are relative to `src/lib/features/`.

| file                                                                    | errors listed |  fixed |  left | note                                                                                                 |
| ----------------------------------------------------------------------- | ------------: | -----: | ----: | ---------------------------------------------------------------------------------------------------- |
| `admin/components/ActiveUsersPanel.svelte`                              |             1 |      1 |     0 | Parser now accepts its read-only get capability; root edit in admin/domain/session-replay-target.ts. |
| `assemble-lab/components/BuilderControls.svelte`                        |             2 |      2 |     0 | Discard boolean undo/redo return values in void callbacks.                                           |
| `background-builder/components/OceanLab.svelte`                         |             1 |      1 |     0 | Contextual chip return type comes from ComponentProps<typeof LabStatusBar>.                          |
| `choreo-card/components/CardInspectModal.svelte`                        |             1 |      1 |     0 | Normalize absent sequence to the child contract's null.                                              |
| `choreo-card/components/TnDTurnMatrix.svelte`                           |             2 |      2 |     0 | Predicate coordinates are numbers, matching TurnCoord.                                               |
| `choreo-card/components/card-back/InfoCardCanvasPreview.svelte`         |             1 |      1 |     0 | Explicit cosmic fallback preserves renderer's existing fallback palette.                             |
| `choreo-card/components/deck-releaser/FestivalSamplerTurnReview.svelte` |             2 |      2 |     0 | Formatter accepts the existing float sentinel fl and retains String formatting.                      |
| `choreo-card/components/print-preview/PrintPanel.svelte`                |             1 |      1 |     0 | Remove ignored detail prop; ExportTakeover neither declares nor consumes it.                         |
| `community/components/GlobalUserMap.svelte`                             |             7 |      0 |     7 | Missing shared Google Maps declarations; proposal below; file untouched.                             |
| `contact-lab/components/ContactHandRig.svelte`                          |             1 |      1 |     0 | Type material collection as Material[] so map callback is contextual.                                |
| `fuse/components/FuseLivePathGrid.svelte`                               |             1 |      1 |     0 | Pass left/right visibility expected by the mandala API.                                              |
| `fuse/components/FuseRecipeBasics.svelte`                               |             1 |      1 |     0 | Exhaustive shared Fuse difficulty map includes level 4 and round-trips it.                           |
| `fuse/components/FuseRecipeRail.svelte`                                 |             1 |      1 |     0 | Same shared Fuse difficulty map fixes second consumer.                                               |
| `fuse/components/FuseRecipeSettings.svelte`                             |             1 |      1 |     0 | Capture the narrowed destination in a template constant before the child snippet.                    |
| `learn/play/components/previews/PerformerStageLite.svelte`              |             1 |      1 |     0 | Use package bluePropType/redPropType API.                                                            |
| `learn/quiz/components/shared/QuizPerformerStage.svelte`                |             1 |      1 |     0 | Use package bluePropType/redPropType API.                                                            |
| `movement-map/components/FrameTransport.svelte`                         |             6 |      6 |     0 | String option IDs match SegmentedControl; convert back to numeric state on selection.                |
| `movement-map/components/SetupView.svelte`                              |             1 |      1 |     0 | Remove ignored alt prop; thumbnail owns its generated image alt text.                                |
| `museum/scenes/procedural/components/PerformerPlatform.svelte`          |             1 |      1 |     0 | Use package bluePropType/redPropType API.                                                            |
| `post/components/StudioProjectCreate.svelte`                            |             2 |      2 |     0 | Read and clear the event's typed currentTarget input.                                                |
| `stage/components/StageStarterTestHarness.svelte`                       |             1 |      1 |     0 | Discard counter assignment return value in void callback.                                            |
| `stage/components/StageTimeline.svelte`                                 |             1 |      1 |     0 | Capture discriminated selection before entering find callback.                                       |
| `stage/components/StudioPreviewPerformer.svelte`                        |             1 |      1 |     0 | Use package bluePropState/redPropState API.                                                          |
| `store/components/CardAnatomy.svelte`                                   |             1 |      1 |     0 | Type region dictionary with nullable rectangle values, retaining existing lookup.                    |
| `village/components/VillageAvatar.svelte`                               |             1 |      1 |     0 | Use package bluePropType/redPropType API.                                                            |
| `water-traverse/components/SeaChamberLife.svelte`                       |             3 |      3 |     0 | Canonical ocean water datum replaces missing export; unwrap renderer.current; undefined ref.         |
| `water-traverse/components/SteamColumn.svelte`                          |             2 |      2 |     0 | Retain explicitly inferred uniform record passed by reference to ShaderMaterial.                     |
| `water-traverse/components/TraverseSky.svelte`                          |             2 |      2 |     0 | Retain uniform record; use undefined for Threlte ref absence.                                        |
| `water-traverse/components/TrenchFloor.svelte`                          |             1 |      1 |     0 | Unwrap renderer.current for PMREMGenerator.                                                          |
| `write/components/sheet/SheetPreviewPages.svelte`                       |             1 |      1 |     0 | Child SheetHeaderEditor accepts/defaults absent header; parent file untouched.                       |
| `write/components/sheet/SheetPreviewStage.svelte`                       |             2 |      2 |     0 | Bindable zoom defaults to fit (1).                                                                   |
| **Total**                                                               |        **51** | **44** | **7** | Full checker confirmation pending.                                                                   |

## RUNTIME DEFECTS

- **Observation:** `fuse/components/FuseLivePathGrid.svelte` passed `blue`/`red`; `src/lib/shared/mandala/services/mandala-path-preparer.ts:282,288` only builds paths for `left`/`right`/`both`. **Inference:** the side preview could contain no hand paths. Pass the existing `side` value. This is component wiring requiring rendered mandala coverage; no new browser-free unit test was added for that wiring.
- **Observation:** the two Fuse difficulty maps lacked level 4, and their reverse maps sent SKEWED to 3. `src/lib/features/create/generate/components/cards/LevelCard.svelte` maps SKEWED to level 4; the canonical turn palette includes quarter turns at level 4. **Inference:** a saved level-4 recipe rendered with undefined difficulty, and selecting level 4 selected level 3. Both editors now use `fuse/domain/fuse-difficulty-levels.ts`. Five focused assertions pass, including all four level round trips.
- **Observation:** the scene package's `PerformerRig.svelte` consumes `bluePropType`/`redPropType`, and `Avatar3D.svelte` consumes `bluePropState`/`redPropState`; the listed feature consumers passed left/right names. **Inference:** chosen non-default props were ignored in museum/village; the two learn previews relied on default staff selection; the studio preview omitted the explicit null states. Use the actual package API in the five listed consumers. WebGL scenes were not rendered in this lane; these wiring changes have compiler syntax coverage only.
- **Observation:** `SeaChamberLife.svelte` imported `WATER_Y`, which is absent from `god-ray-axis.ts`. Current shafts use the canonical ocean depth and `userProportionsState.groundY`. **Inference:** module loading could fail before rendering the water scene. Compute its ocean-to-traverse waterline translation from those existing sources. The adjacent obsolete fixed-depth comment was updated. No WebGL runtime test was available.
- **Observation:** both water environment probes passed Threlte's `{ current: WebGLRenderer }` wrapper to `PMREMGenerator`. **Inference:** probe generation called renderer methods on the wrapper and failed, preventing the intended reef/floor lighting. Pass `renderer.current`. Camera access in the same component now uses its documented `current` property, removing pre-existing unknown casts. This path needs a WebGL scene to exercise; it was not runtime-tested here.
- **Observation:** `SheetPreviewPages.svelte` renders `SheetHeaderEditor` on pages after page 1 even without annotations; its formatter immediately reads header fields. **Inference:** a multi-page preview without annotations could throw. Default the optional header in the child. Added `SheetHeaderEditor.svelte.test.ts` exercises that specific later-page path, but its browser test could not start (see TESTS RUN).
- **Observation:** optional zoom had no default but fed arithmetic and the numeric layout function in `SheetPreviewStage.svelte`. **Inference:** an omitted prop could yield NaN zoom labeling/layout. Default it to the existing fit value, 1. Existing sheet layout tests pass; mounting the full stage requires the component environment.

The remaining fixes either preserve runtime values or make event/ref contracts precise. No template text or intentional CSS/geometry was changed. The required formatter rewrote existing formatting in several files, most visibly `VillageAvatar.svelte`.

## ROOT CAUSES

- Read-only URL parameters: the replay parser only needs `get`, so its input is now `Pick<URLSearchParams, "get">` instead of a mutable URLSearchParams. This fixes the untouched ActiveUsersPanel caller and preserves the parser's behavior.
- Callback contracts: bridge and starter callbacks require void; imperative wrappers discard existing boolean/numeric return values.
- Literal widening/context: infer chip types from the receiving component; type numeric turn coordinates; accept the actual float turn sentinel; retain concrete uniform records rather than indexing Three's optional uniform dictionary.
- Nullability: normalize absent card sequences; default fit zoom and absent headers; align Threlte bound refs with undefined; use event.currentTarget instead of the optional bound input variable.
- Generic UI IDs: SegmentedControl constrains IDs to strings; stringify numeric options and selected state, then parse emitted IDs back to numeric state. Labels and stored numerical values remain unchanged.
- Narrowing through closures: capture the selected travel union member before find; capture the truthy Fuse destination in a template constant before the nested children snippet. The first commit's repeated guard alone could not preserve mutable-prop narrowing inside that closure; a follow-up commit completes the fix.
- Shared APIs still use color names: call the installed scene package with blue/red names rather than changing package files. Package source was inspected read-only through its node_modules link; no package edits were made.
- Existing ignored props: ExportTakeover has no `detail` prop or rendering path, and PropAwareThumbnail generates its own image alt text. Removing the ignored attributes changes neither visible text nor runtime behavior.
- Rune imports in touched files now use `.svelte.js` for state modules.

## LEFT

**Observation:** all seven diagnostics in `community/components/GlobalUserMap.svelte` remain, at listed lines 148, 185, 190, 192, 196, 197, and 202. `src/types/global.d.ts:54-76` declares only constructor/panTo/setZoom on Map and lacks cameraControl/keyboardShortcuts, LatLngBounds, and the event namespace. That file is outside this lane's ownership. The component is untouched; no casts, suppression, removal of map behavior, or local duplicate API declarations were used.

**Proposal for the owning lane:** extend the existing Google Maps namespace in `src/types/global.d.ts` with the narrow API used by GlobalUserMap:

```ts
interface Map {
  setCenter(latLng: LatLngLiteral): void;
  fitBounds(bounds: LatLngBounds, padding?: number): void;
  getZoom(): number | undefined;
}
interface MapOptions {
  cameraControl?: boolean;
  keyboardShortcuts?: boolean;
}
class LatLngBounds {
  extend(point: LatLngLiteral): this;
}
namespace event {
  function addListenerOnce(
    instance: Map,
    eventName: string,
    handler: () => void
  ): { remove(): void };
}
```

Merge the interfaces into the existing declarations, retaining the existing Map constructor and other methods. **Inference:** these additions address the seven reported failures and may expose further unchecked uses, including array-index nullability, on the coordinator's next full run. That has not been measured here.

## PACKAGE PROPOSALS

None. The installed scene package already exposes the needed blue/red props in its source contract. This lane fixes its consumers without changing `packages/**`.

## TESTS RUN

**Observation:** these commands completed in this worktree. No checker/build was substituted for the coordinator's full run.

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/admin/session-replay-target.test.ts tests/unit/fuse/fuse-difficulty-levels.test.ts tests/unit/fuse/fuse-actions-contract.test.ts tests/unit/fuse/fuse-recipe-panel.test.ts tests/unit/fuse/fuse-recipe-summaries.test.ts tests/unit/capacitor-static-env-contract.test.ts tests/unit/layout-motion-contract.test.ts tests/unit/stage/stage-module-contract.test.ts tests/unit/landing-route-morph.test.ts tests/unit/sequence-selection-contract.test.ts tests/unit/sheet-title-block.test.ts tests/unit/sheet-workspace-layout.test.ts --maxWorkers=2
```

Result: exit 0; `Test Files 12 passed (12)`; `Tests 85 passed (85)`.

After the final CardAnatomy type annotation changed, its existing source-contract suite was repeated:

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/landing-route-morph.test.ts --maxWorkers=2
```

Result: exit 0; `Test Files 1 passed (1)`; `Tests 27 passed (27)`.

```powershell
npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/stage/components/StageStarter.svelte.test.ts src/lib/features/write/components/sheet/SheetHeaderEditor.svelte.test.ts --maxWorkers=1
```

Result: exit 1 before any tests; `Error: listen EACCES: permission denied ::1:63315`; `Test Files no tests`; `Tests no tests`; `Errors 1 error`.

Safe retry:

```powershell
npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/stage/components/StageStarter.svelte.test.ts src/lib/features/write/components/sheet/SheetHeaderEditor.svelte.test.ts --maxWorkers=1 --browser.api.host=127.0.0.1 --browser.api.port=6410
```

Result: exit 1 with the same `listen EACCES: permission denied ::1:63315` before any tests. The supplied CLI host/port did not change the endpoint that failed. Both runs also logged `no Svelte config found` and an optimizer close timeout. The existing StageStarter suite and new header regression remain unverified. No task Vitest process remained in the worktree-specific process query after the runs exited.

Lint/formatting commands used an explicit array of all 33 changed/new TS and Svelte paths, excluding this Markdown ledger:

```powershell
npx eslint $ownedFiles
npx eslint $ownedFiles --no-warn-ignored
npx prettier --check $ownedFiles
git diff --check
```

Results: ESLint exit 0, `0 errors, 30 warnings` on the first invocation; warnings report ignored files. The repository explicitly ignores `**/*.svelte` and `tests/` in eslint.config.js. The second invocation exits 0 with ignored-file warnings hidden; this does not establish lint coverage for ignored Svelte files. Prettier exit 0, `All matched files use Prettier code style!`. Whitespace diff check exits 0.

Additional direct `node --input-type=module` stdin check used `svelte/compiler.compile` with `generate: "client", modernAst: true` on every changed Svelte file and compared its nonblank template Text nodes against `git show HEAD:<path>`, collapsing whitespace. Result: exit 0, `Svelte compile + template text comparison: 29/29 passed`. This confirms syntax compilation and unchanged literal template text, not type safety or WebGL rendering. A separate import scan found no touched state-module `.svelte` imports missing `.js`.

Final Fuse follow-up verification:

```powershell
npx prettier --check src/lib/features/fuse/components/FuseRecipeBasics.svelte src/lib/features/fuse/components/FuseRecipeRail.svelte src/lib/features/fuse/components/FuseRecipeSettings.svelte
npx eslint src/lib/features/fuse/components/FuseRecipeBasics.svelte src/lib/features/fuse/components/FuseRecipeRail.svelte src/lib/features/fuse/components/FuseRecipeSettings.svelte --no-warn-ignored
npx vitest run --config tests/config/vitest.config.ts tests/unit/fuse/fuse-difficulty-levels.test.ts tests/unit/fuse/fuse-actions-contract.test.ts tests/unit/fuse/fuse-recipe-panel.test.ts --maxWorkers=2
```

Results: Prettier and ESLint exit 0 (the same ignored-Svelte limitation applies); Vitest exit 0, `Test Files 3 passed (3)`, `Tests 17 passed (17)`. Direct Svelte compilation after the snippet capture and type-import fixes reports `Final Fuse Svelte compile: 3/3 passed`.

## COMMITS

These code commits were observed after successful scoped commits. This ledger's own commit is available in the branch history.

- `4a35f2405c` fix(types): w4-features admin (1 errors)
- `c2e61295e6` fix(types): w4-features assemble-lab (2 errors)
- `9940649065` fix(types): w4-features background-builder (1 errors)
- `a79101121d` fix(types): w4-features choreo-card (7 errors)
- `f020069932` fix(types): w4-features contact-lab (1 errors)
- `0ce056294d` fix(types): w4-features fuse (4 errors)
- `98ee0a00a9` fix(types): w4-features learn (2 errors)
- `1e65a116d5` fix(types): w4-features movement-map (7 errors)
- `5bbadc215e` fix(types): w4-features museum (1 errors)
- `eebf201728` fix(types): w4-features post (2 errors)
- `2c195e68f7` fix(types): w4-features stage (3 errors)
- `b9970314b2` fix(types): w4-features store (1 errors)
- `badf873154` fix(types): w4-features village (1 errors)
- `c7dccb0b63` fix(types): w4-features water-traverse (8 errors)
- `00c0d5f53c` fix(types): w4-features write (3 errors)

- `e316f2efa2` fix(types): w4-features fuse snippet capture and type imports
