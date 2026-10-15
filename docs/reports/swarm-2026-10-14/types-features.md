# Types swarm: Browse, Lab, Museum, public Composer

Observation: this is the ledger for the assigned `2026-10-14` lane on branch `codex/swarm-types-features`, based on `33a46f16076ec1751ff39bb3e1d59126762bb804`. The input lists 77 diagnostics in 32 files. No full type checker was run; the brief reserves that check for the coordinator. Counts below describe source corrections against the supplied messages, not measured checker clearance.

Observation: 43 listed diagnostics received source corrections, two were ALREADY FIXED on the base, and 32 remain LEFT. No changes were made to packages, primary checkout, other worktrees, or public Composer/Browse copy or layout. No push, integration, installation, build, full check, or application dev server was run.

## File ledger

Paths are relative to the repository. `fixed` includes the two explicitly marked ALREADY FIXED entries; those files were not edited.

| file                                                                                   | errors listed |  fixed |   left | note                                                                                                                              |
| -------------------------------------------------------------------------------------- | ------------: | -----: | -----: | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/features/browse/collections/components/AllLibraryView.svelte`                 |             1 |      0 |      1 | LEFT: native Snippet, S below.                                                                                                    |
| `src/lib/features/browse/collections/components/MyCollectionsPanel.svelte`             |             1 |      0 |      1 | LEFT: native Snippet, S.                                                                                                          |
| `src/lib/features/browse/collections/components/WorkShelfRail.svelte`                  |             1 |      0 |      1 | LEFT: native Snippet, S.                                                                                                          |
| `src/lib/features/browse/gallery-home/FilterWorkspace.svelte`                          |             1 |      0 |      1 | LEFT: native Snippet, S.                                                                                                          |
| `src/lib/features/browse/gallery-home/GalleryWorkspace.svelte`                         |            12 |      0 |     12 | LEFT: native GalleryValueHeadSnippet assignments, S.                                                                              |
| `src/lib/features/browse/gallery-home/value-editors/GalleryFamilyEditor.svelte`        |             1 |      0 |      1 | LEFT: overload when passing a native trailing snippet, S.                                                                         |
| `src/lib/features/browse/gallery-home/value-editors/GalleryLoopEditor.svelte`          |             1 |      0 |      1 | LEFT: overload when passing a native trailing snippet, S.                                                                         |
| `src/lib/features/browse/shared/components/BrowseModule.svelte`                        |             4 |      3 |      1 | Clone readonly query parameters via their serialized representation; native Snippet remains S.                                    |
| `src/lib/features/lab/tabs/collision-lab/components/CandidateThumbnailViewport.svelte` |             1 |      1 |      0 | Map Avatar3D inputs to its actual blue/red API.                                                                                   |
| `src/lib/features/lab/tabs/collision-lab/components/PoseViewport.svelte`               |             1 |      1 |      0 | Same Avatar3D boundary mapping.                                                                                                   |
| `src/lib/features/lab/tabs/combinator/CombinatorLab.svelte`                            |             1 |      1 |      0 | Accept null letters; retain connector classification.                                                                             |
| `src/lib/features/lab/tabs/fan-relations/FanRelationsLab.svelte`                       |             3 |      3 |      0 | GridLocation callback parameters and full FanViewpoint state union.                                                               |
| `src/lib/features/lab/tabs/fan-relations/components/FanRelationScene.svelte`           |             1 |      1 |      0 | Avatar3D prop states and anchor references use blue/red API.                                                                      |
| `src/lib/features/lab/tabs/scene-lab/components/ScenePreview.svelte`                   |             3 |      3 |      0 | Discard boolean undo/redo return values in void callbacks; Avatar3D input names.                                                  |
| `src/lib/features/lab/tabs/spatial-lab/components/SpatialScene.svelte`                 |             1 |      1 |      0 | Avatar3D input names.                                                                                                             |
| `src/lib/features/lab/tools/3d-controls/ThreeDControlsLab.svelte`                      |             1 |      1 |      0 | Avatar3D input names.                                                                                                             |
| `src/lib/features/lab/trigrid-lab/TriGridLabModule.svelte`                             |             2 |      2 |      0 | GridLocation callback parameters.                                                                                                 |
| `src/lib/features/lab/trigrid-lab/components/TriGridControls.svelte`                   |             2 |      2 |      0 | GridLocation callback parameters.                                                                                                 |
| `src/lib/features/lab/vtg-lab/components/RotationStyleExplorer.svelte`                 |             2 |      2 |      0 | Numeric turn-key parameters.                                                                                                      |
| `src/lib/features/museum/components/game/DrownedGalleryAuthored.svelte`                |             1 |      1 |      0 | Normalize absent face URI to null at component boundary.                                                                          |
| `src/lib/features/museum/components/game/FirstFireAuthored.svelte`                     |             3 |      3 |      0 | Shared root fixed in owned `data/first-fire-blender-contract.ts`: shrine ID retains FirstFireShrineId union. Component unchanged. |
| `src/lib/features/museum/components/game/MoonGraybox.svelte`                           |            11 |     11 |      0 | Correct meteor config path; declare four existing constructed Scene members.                                                      |
| `src/lib/features/museum/components/game/Museum3DScene.svelte`                         |             1 |      1 |      0 | Avatar3D null inputs use blue/red names.                                                                                          |
| `src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte`              |             1 |      1 |      0 | ALREADY FIXED: shared character state already exposes live blue/red getters and rig plane overrides.                              |
| `src/lib/features/museum/components/game/SundialGraybox.svelte`                        |             1 |      1 |      0 | Traverse Threlte scene.current, through tested shadow helper.                                                                     |
| `src/lib/features/museum/scenes/procedural/components/PerformerPlatform.svelte`        |             1 |      1 |      0 | ALREADY FIXED: same shared character-state compatibility getters.                                                                 |
| `src/routes/(public)/composer/_components/ComposerArcadeDemo.svelte`                   |             2 |      2 |      0 | Current challenges/startChallenge API; browser regression test.                                                                   |
| `src/routes/(public)/composer/_components/ComposerBackgroundCycle.svelte`              |             3 |      3 |      0 | Guaranteed fallback from the existing nonempty const tuple.                                                                       |
| `src/routes/(public)/composer/_components/ComposerExperience.svelte`                   |             7 |      0 |      7 | LEFT: native Snippet, S.                                                                                                          |
| `src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte`                   |             2 |      0 |      2 | LEFT: native Snippet, S.                                                                                                          |
| `src/routes/(public)/composer/_sections/ConstructSection.svelte`                       |             1 |      0 |      1 | LEFT: missing shared AnimationPlayer playback gating contract, A below.                                                           |
| `src/routes/(public)/composer/_sections/GenerateSection.svelte`                        |             3 |      0 |      3 | LEFT: native Snippet, S.                                                                                                          |
| **TOTAL**                                                                              |        **77** | **45** | **32** | **43 source corrections + 2 ALREADY FIXED.**                                                                                      |

## RUNTIME DEFECTS

- Observation: seven Avatar3D call sites supplied `leftPropState`/`rightPropState`, although the installed `node_modules/@austencloud/scene-3d/src/lib/components/Avatar3D.svelte:128-129` declares `bluePropState`/`redPropState` and its IK calculation reads those names. Some lab callers also supplied left/right anchor-reference names. Inference: those props were ignored at the component boundary, so actual prop state/anchor placement was not delivered. The fixes explicitly map the existing values onto the package names; they do not rename application state. This includes six Lab files and Museum3DScene. These render paths require a 3D browser environment and were not visually exercised.
- Observation: ComposerArcadeDemo used `game?.levels[0]` and `session.startLevel`, whereas the current registry/session exposes `challenges` and `startChallenge` (`src/lib/features/learn/play/state/arcade-session-state.svelte.ts:106,325`). Inference: mounting the old demo would fail before starting the quiz. The new browser component test mounts it with the real session and asserts the first ten-question Type 1 challenge starts and the displayed total remains `/10`.
- Observation: SundialGraybox called `threeScene.traverse`, while useThrelte supplies the scene through `{ current: Scene }`. Inference: the lit shadow sweep would throw instead of enabling performer shadows. `services/sundial-performer-shadows.ts` unwraps `.current`, flags nested sun station meshes only, and returns the station count used by the existing bounded sweep. Two pure tests cover the wrapper, unrelated stations, late arrivals, and a replaced current scene.
- Observation: MoonGraybox read `cosmic.particles?.effects?.meteorStreaks`, but `createDefaultCosmicNightConfig` supplies meteorStreaks directly under particles (`src/lib/shared/3d/environments/domain/models/scene-configs.ts`). Inference: the optional chain always yielded undefined, suppressing the configured meteor sky. The corrected property path restores the existing intended config. This WebGL render path was not browser-tested.

## ROOT CAUSES

- Observation: BrowseModule clones SvelteKit's ReadonlyURLSearchParams three times. The native URLSearchParams constructor type does not accept that readonly wrapper. Passing `.toString()` preserves all query pairs without mutating the source.
- Observation: several callback parameters lacked explicit domain types. GridLocation and number annotations express their actual inputs. FanViewpoint state had inferred only the default `audience` literal; an explicit FanViewpoint parameter admits all existing choices.
- Observation: Combinator's step letter is nullable. The origin classifier now declares and handles null as connector, matching the old set-membership fallthrough. ScenePreview's undo/redo return booleans while toolbar action callbacks promise void; block callbacks retain the action and intentionally discard its result.
- Observation: FirstFireBlenderContract widened shrine IDs to string while their producer uses `FirstFireShrineId` (`fl | dj | ek`). Retaining that producer union in `data/first-fire-blender-contract.ts` fixes three downstream index/callback diagnostics without assertions.
- Observation: MoonGraybox's Scene object already constructs outerPlain, farCraterRim, hill and far, but the explicit interface omitted them. The interface now describes those actual geometry/helper types.
- Observation: DrownedGallery's face URI may be absent; nullish normalization satisfies the existing child contract. ComposerBackgroundCycle's mapped array index was possibly undefined; the existing nonempty ANIMATED_BACKGROUNDS const tuple supplies the same fallback label/icon safely. Neither change alters user-facing copy or geometry.
- Observation: the two performer-state errors are stale. Base `src/lib/shared/3d/state/character-instance-state.svelte.ts:1539-1544` already returns left/right state through blue/red getters, and `:1471-1472` returns converted rigBeatPlaneOverrides. These files were not changed in this lane. Inference: this matches the missing package compatibility fields described in the earlier batch ledger; coordinator checking is still required to prove the stale messages are absent.

## LEFT

### S: 31 native Snippet diagnostics

Observation: 19 Browse and 12 Composer diagnostics concern native Svelte snippet assignments or overloads. The table enumerates every affected file/count. The unchanged `src/lib/features/browse/gallery-home/gallery-workspace-types.ts` imports Snippet from `svelte` and declares `Snippet<[title: string, hint?: string, trailing?: Snippet]>`; GalleryWorkspace's native `#snippet valueHead` has that same parameter list. WorkShelfRail likewise accepts the native `Snippet<[WorkShelfId]>`. The input diagnostic reports generated `ReturnType<import("svelte").Snippet>` as incompatible with native Snippet. No complete nested diagnostic or reproduction of the checker environment is available in this lane.

Observation: `docs/reports/swarm-2026-10-14/svelte-check-batch-1.md` records the same unresolved native Snippet family across other features and explicitly proposes obtaining nested diagnostics before changing contracts.

Inference: the short messages do not establish a source contract error or a safe local patch. Duplicate type identity/toolchain resolution is a possibility, not a confirmed cause. Widening Snippet, wrapping it in a permissive callback type, or casting native snippets would silence the checker without proving a fix and is forbidden by the brief.

Proposal: coordinator reruns the full check on these commits, captures complete nested errors, and compares the resolved Svelte type identities for generated snippets and receiving props. If the messages are already absent, mark them ALREADY FIXED with that checker evidence. No speculative dependency change is proposed.

### A: one ConstructSection shared component contract

Observation: ConstructSection at lines 681-682 passes `playbackAllowed={active}` and `resumeWhenPlaybackAllowed` to `src/lib/shared/sequence-viewer/components/AnimationPlayer.svelte`. That shared component's props neither declare nor implement those flags. It is outside this lane's owned paths. Removing the caller's intended gating flags would only hide the missing behavior contract.

Proposal for the shared sequence-viewer owner: implement optional typed `playbackAllowed` and `resumeWhenPlaybackAllowed` inputs, defaulting to current behavior for existing callers; pause when playback becomes disallowed, remember prior playing state, and resume only when allowed and requested. Add focused lifecycle/transition regression coverage, including an already-paused viewer and repeated active/inactive transitions. Coordinator should reconcile this proposal with the shared lane before implementation. No shared component file was edited here.

## PACKAGE PROPOSALS

Observation: no package edit was established as necessary. The installed scene package already has an explicit blue/red boundary API; the owned callers now supply it without casts. The native Snippet cause remains unestablished, so there is no evidence-based exact package patch to recommend. The AnimationPlayer proposal above is an application shared-component change, not a package change.

## TESTS RUN

Observation: all commands below were focused local checks permitted by the brief. No tsc, svelte-check, full suite, build, or application dev server ran. Component Vitest used its own temporary browser server and exited after the test.

Temporary test configuration, restored before commits:

- Unit cacheDir: `tests/.cache/swarm-types-features/vitest.config.ts`; SvelteKit outDir: `tests/.cache/swarm-types-features/kit`.
- Component cacheDir: `tests/.cache/swarm-types-features/vitest.components.config.ts`; browser API: `host: 127.0.0.1, port: 5243`.
- Native/runner config loaders avoided config-bundle output through the shared node_modules junction. Logs and caches stayed under owned `tests/.cache/swarm-types-features/` (ignored, not committed).
- Observation: the first unit startup attempt failed with `config_kit_namespace` from an incorrect temporary nested option; setting outDir directly fixed it. The first browser startup failed `listen EACCES: permission denied ::1:63315`; placing the API override under browser and using IPv4/free port fixed it. Neither failed startup executed tests.
- `git diff --exit-code -- tests/config/vitest.config.ts tests/config/vitest.components.config.ts` returned exit 0 after restoring both config files byte for byte. No config change is committed.

### Unit command

```powershell
npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 tests/unit/museum/sundial-performer-shadows.test.ts tests/unit/museum/first-fire-blender-contract.test.ts tests/unit/museum/first-fire-graybox-review.test.ts tests/unit/museum/first-fire-graybox-colliders.test.ts tests/unit/museum/first-fire-locked-cameras.test.ts tests/unit/museum/drowned-gallery-traversal.test.ts tests/unit/museum/drowned-gallery-shell-materials.test.ts tests/unit/museum/museum-rendering-performance-contract.test.ts tests/unit/effects/scene-effects-batching-contract.test.ts tests/unit/browse/browse-primary-sync-contract.test.ts tests/unit/opus-firestore-audit/community-feed-fanout.test.ts tests/unit/landing-constrained-performance-contract.test.ts
```

```text
Test Files  12 passed (12)
     Tests  102 passed (102)
Duration 19.93s
exit 0
```

Observation: these include the new shadow helper regression and existing tests referencing changed museum, browse, and landing paths. No existing sibling/test reference was found for the remaining changed Lab components. Log: `tests/.cache/swarm-types-features/unit.log`.

### Browser component command

```powershell
npx vitest run --config tests/config/vitest.components.config.ts --configLoader runner --no-cache --maxWorkers 1 'src/routes/(public)/composer/_components/__tests__/ComposerArcadeDemo.svelte.test.ts'
```

```text
Test Files  1 passed (1)
     Tests  1 passed (1)
Duration 40.25s
exit 0
```

Observation: the actual session/registry are used, while the heavy Pictograph renderer and analytics calls are mocked. The test verifies startup and challenge content, not WebGL appearance. Log: `tests/.cache/swarm-types-features/components-retry.log`.

### Lint and formatting commands

Observation: before source commits, the exact lint invocation was:

```powershell
$changedCode = @((git diff --name-only -- '*.ts' '*.svelte') | Where-Object { $_ -notlike 'tests/config/*' })
$changedCode += @('src/lib/features/museum/services/sundial-performer-shadows.ts','tests/unit/museum/sundial-performer-shadows.test.ts','src/routes/(public)/composer/_components/__tests__/ComposerArcadeDemo.svelte.test.ts')
$changedCode | Set-Content tests/.cache/swarm-types-features/changed-code.txt
npx eslint $changedCode
```

Result: exit 0, `20 problems (0 errors, 20 warnings)`: 19 files ignored by the repository's Svelte/tests ignore patterns and one inline import-type style warning in the new component test. The import-type warning was fixed by using a top-level type namespace import, then verified with:

```powershell
npx eslint 'src/routes/(public)/composer/_components/__tests__/ComposerArcadeDemo.svelte.test.ts'
```

Result: exit 0, no output. Thus no actionable lint finding remains, but ignored Svelte/test files were not lint-validated. Logs: `eslint.log`, `eslint-test-retry.log` under the ignored task cache.

```powershell
npx prettier --check @(Get-Content tests/.cache/swarm-types-features/changed-code.txt)
```

Result: exit 0, `All matched files use Prettier code style!`. The component test's later type-only import edit was also formatted with Prettier. Whole-file formatting normalized existing tabs/wrapping in several owned files (notably CombinatorLab); that is formatting churn, not intended behavioral change. No visual appearance claim is based on formatting checks.

Final source-and-ledger formatting/whitespace checks also returned exit 0:

```powershell
$verifiedPaths = @(Get-Content tests/.cache/swarm-types-features/changed-code.txt) + @('docs/reports/swarm-2026-10-14/types-features.md')
npx prettier --check $verifiedPaths
git diff --check 33a46f16076ec1751ff39bb3e1d59126762bb804
```

Result lines: `All matched files use Prettier code style!`; git diff --check produced no output.

## IMPLEMENTATION COMMITS

```text
6185783c8b54abd24c4c3a5323be809865cc2943 fix(types): features browse (3 errors)
fab19061dd673101d4c4375e6e987dd4d3bb2fa8 fix(types): features lab (18 errors)
8079f60bdbd5dcdfbd00f1bab52084c67b3a6bbd fix(types): features museum (17 errors)
b5405d6cca4b2001b63d007f2793cc48ed267405 fix(types): features composer (5 errors)
```

Observation: each source commit used explicit owned file pathspecs for both staging and committing, preceded by `git status --short`. The ledger is committed separately. Source commit subjects count supplied diagnostics addressed by source changes, pending coordinator checker confirmation.

## DELIVERY / DEVIATIONS

- Observation: retained branch/worktree for coordinator integration as the swarm brief requires; did not run the usual primary-checkout integration workflow.
- Observation: temporary owned test-config adjustments were necessary for cache confinement and a denied browser port, and were restored. Whole-file Prettier normalization adds formatting-only changes in touched files.
- Observation: 32 errors remain explicitly LEFT. Full checker clearance, browser appearance of 3D scenes, and shared AnimationPlayer gating are not claimed.
- Proposal: coordinator runs the full type check, supplies nested Snippet diagnostics, and routes the shared AnimationPlayer contract to its owner. No Austen product decision or approval is needed for the work recorded here.
