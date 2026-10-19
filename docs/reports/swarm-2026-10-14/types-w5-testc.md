# Wave 5 testc type repairs

Date: 2026-10-18. Branch: `codex/swarm-types-w5-testc`.
Baseline commit observed at start: `2841631dcf` (`Merge branch 'codex/poi-momentum'`).
Scope: the 14 developer test routes assigned by the coordinator. No shared or package files edited. No integration, push, install, dev server, tsc, or svelte-check run.

**Observation:** 18 listed Svelte files and two directly required local TypeScript dependencies were changed. The starting worktree was clean.

**Inference:** the changes address all 71 supplied diagnostics. The fixed counts below are static assessments against the supplied list, **not measured full-check results**. The coordinator must verify with the full type check on the other machine.

## File ledger

Paths in this table are relative to `src/routes/test/`.

| file                                                                                | errors listed |  fixed |  left | note                                                                                                           |
| ----------------------------------------------------------------------------------- | ------------: | -----: | ----: | -------------------------------------------------------------------------------------------------------------- |
| sequence-videos/+page.svelte                                                        |             1 |      1 |     0 | Seed required sequence performance associations and performers.                                                |
| sequence-viewer-transitions/\_components/SequenceViewerTransitionReviewFrame.svelte |             3 |      3 |     0 | Narrow alpha token, pair nodes with saved styles, repair local trace mode contract.                            |
| sequence-viewer-transitions/\_components/TransitionGeometryTrace.svelte             |             3 |      3 |     0 | Narrow first/last samples; allow real nullable selected-mode samples in local analyzer.                        |
| sequence-viewer-transitions/+page.svelte                                            |             3 |      3 |     0 | Compare through the declared gate availability domain, retaining pending UI.                                   |
| silk-2d-lab/+page.svelte                                                            |             7 |      7 |     0 | Six existing module imports require .js; inferred preset callback type returns with imports.                   |
| silk-3d-lab/+page.svelte                                                            |             7 |      7 |     0 | Same six-import root cause and callback cascade.                                                               |
| smart-collections/\_components/SmartCollectionReviewFrame.svelte                    |             1 |      1 |     0 | Current section is placement, not position.                                                                    |
| spatial-sculpture/SpatialSculptureScene.svelte                                      |             1 |      1 |     0 | Current grid map function is getAllGridPositions.                                                              |
| staff-grip/StanceTimingChart.svelte                                                 |             2 |      2 |     0 | Narrow captured first and last frames before reading time.                                                     |
| staff-grip/+page.svelte                                                             |             1 |      1 |     0 | Remove obsolete rendererParameters; installed default renderer already sets alpha true.                        |
| step-map-editor/+page.svelte                                                        |             2 |      2 |     0 | Seed association/performer fields; retain known string sequenceId locally for store lookup.                    |
| torch-contrast/+page.svelte                                                         |             1 |      1 |     0 | Distinguish CSS color id from preview hand-side key.                                                           |
| viewer-3d/Viewer3DWorkbench.svelte                                                  |            12 |     12 |     0 | Narrow JSON camera entry and all six coordinates; retain default framing fallback.                             |
| water-grotto/WaterGrottoWalkScene.svelte                                            |             4 |      4 |     0 | Use correctly typed useScene/useRenderer hooks instead of misleading ambient useThrelte types.                 |
| water-traverse/WaterTraverseWalkScene.svelte                                        |             4 |      4 |     0 | Flat-map adjacent samples and guard the terminal sample.                                                       |
| winter-scene/HarnessToneMapping.svelte                                              |             6 |      6 |     0 | useRenderer exposes the actual renderer without ambient useThrelte wrappers.                                   |
| winter-scene/WinterCompositionPlan.svelte                                           |             7 |      7 |     0 | Reuse existing point normalizer to obtain two-number tuples.                                                   |
| worker-scene-switch/+page.svelte                                                    |             6 |      6 |     0 | Move global declaration to module script; supply required triangleGrip.                                        |
| sequence-viewer-transitions/transition-geometry-trace.ts                            |             0 |      0 |     0 | Dependent contract fix: modeCommits accepts the existing selectedMode domain, including post-studio.           |
| sequence-viewer-transitions/studio-surface-motion.ts                                |             0 |      0 |     0 | Dependent contract fix: selectedMode is genuinely nullable in incoming traces; no sample filtering or casting. |
| **Total**                                                                           |        **71** | **71** | **0** | Full-check confirmation pending.                                                                               |

## RUNTIME DEFECTS

- **Observation:** `torch-contrast/+page.svelte` creates `HandPreviews` with `left`/`right` fields, but the large-preview template indexed it with `hand.id` (`blue`/`red`). **Inference:** these lookups produced undefined rather than SVG markup. The template now uses an explicit `side` field while retaining color ids for CSS and labels.
- **Observation:** `spatial-sculpture/SpatialSculptureScene.svelte` imported `getAllGridPlacements`, which `src/lib/shared/3d/services/plane-coordinate-mapper.ts` does not export. That module exports `getAllGridPositions(plane, radius): Map<GridLocation, Vector3>`, matching the caller's existing Array.from map conversion. **Inference:** the old named import prevented the scene from loading; using the current equivalent API restores it.
- **Observation:** both placement variants in `SmartCollectionReviewFrame.svelte` passed `position`; `src/lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte` declares `placement` in FilterPickerSection and seeds GalleryDrill with that section. **Inference:** the old harness could not open its intended placement drill.
- **Observation:** JSON camera arrays are not statically tuples. The current fixture contains a camera; no failure of that valid fixture was observed. The new guards retain the existing null/default-camera path if an entry or coordinate is absent.

The runtime issues above are component markup, import wiring, or component input wiring. No browser-independent production algorithm changed, so no extracted helper or implementation-mirroring regression test was added. Browser rendering was not exercised: the brief forbids starting a dev server. Existing relevant tests were run as listed below.

## ROOT CAUSES

- **Observation:** `src/lib/shared/video-collaboration/domain/collaborative-video.ts` requires `associations` and `performers`, and makes `sequenceId` optional for non-sequence media. Both sequence harnesses now explicitly associate seeded videos with their sequences. The step-map store gets the original known string id instead of rereading the optional compatibility property.
- **Observation:** all twelve silk module targets exist in this checkout. Their imports lacked `.js` extensions. Restoring resolution also restores contextual typing for each preset `.find` callback; no fabricated parameter type or replacement renderer was added.
- **Observation:** local transition trace contracts lagged the actual captured values: `selectedMode` already includes null and post-studio, while the motion analyzer accepted only string and modeCommits excluded post-studio. The dependent .ts contracts now express the existing runtime data.
- **Observation:** `TRANSITION_REVIEW_GATES` is `as const satisfies readonly TransitionReviewGate[]`; all current entries are ready, whereas the declared gate domain still includes pending. The page's `isPendingGate(TransitionReviewGate | undefined)` preserves support for that domain without false literal comparisons or casts.
- **Observation:** indexed arrays are not proved nonempty by length tests under the project's indexed-access policy. Captured entries and coordinate values are narrowed; winter map geometry reuses its existing tuple-returning point helper.
- **Observation:** `src/types/global.d.ts:312` augments useThrelte with scene.current and renderer.current. Installed `node_modules/@threlte/core/dist/context/compounds/useThrelte.js` instead returns `sceneCtx.scene` and `rendererCtx.renderer` directly; its camera is the current-bearing object. `useScene` and `useRenderer` are exported in the installed index declarations and bypass only the inaccurate overload, preserving runtime objects. Hooks are acquired during component initialization.
- **Observation:** the installed `node_modules/@threlte/core/dist/context/fragments/renderer.svelte.js` already constructs its default WebGLRenderer with alpha true. Removing unsupported rendererParameters therefore preserves transparency.
- **Observation:** the worker page's global Window augmentation was in an instance script. Moving it and its type-only dependencies to `<script module lang="ts">` puts the augmentation at module scope. WorkerPropBuild requires `triangleGrip: "corner" | "side"`; the staff harness now supplies corner.
- **Observation:** rune module imports touched in the transition page and staff page now use `.svelte.js` specifiers. Prettier also reformatted existing lines in touched files; CSS declarations and geometry values were not changed for formatting.

## LEFT

- **Observation:** no supplied diagnostic was deliberately left unfixed. Actual remaining counts cannot be established here because the brief explicitly prohibits the type checker on this machine.
- **Observation:** the focused test run has one unrelated failure: `tests/unit/3d-animation/staff-grip-contact-contract.test.ts:185` expects `resolveTrackedUpperBodyStance` in `src/lib/shared/3d/performers/LiveSequencePerformer3D.svelte`, which uses `resolvePerformerContact` instead. `git diff --quiet HEAD -- tests/unit/3d-animation/staff-grip-contact-contract.test.ts src/lib/shared/3d/performers/LiveSequencePerformer3D.svelte` returned exit 0 before commits, proving both failing-evidence files were unchanged by this lane. No pre-edit test execution was performed, so this is an unchanged-code failure, not a claimed measured baseline run.
- **Observation:** ESLint excludes all .svelte files and supplies no matching Svelte configuration. Both requested lint attempts exited 0 but skipped those 18 files. The two local .ts changes were linted. No shared lint configuration was changed; standalone Svelte compilation covered component syntax only.

## PACKAGE PROPOSALS

None. No package source was edited or required a workaround.

## SHARED PROPOSALS

- **Proposal:** remove or correct the inaccurate scene/renderer portion of the `@threlte/core` ambient augmentation in `src/types/global.d.ts:312`, using the installed upstream context declarations as the authority. This file is outside this lane. Do not change consumers to scene.current or renderer.current merely to satisfy that overload: those fields are not the installed runtime objects.
- **Proposal:** update the unrelated staff-grip source-contract test after confirming the current shared ownership in `resolvePerformerContact`; the failed assertion currently names a previous direct stance integration. Do not change the shared performer solely to satisfy a stale source-string test.
- **Proposal:** configure .svelte linting centrally if this swarm requires substantive component ESLint coverage; importing eslint-plugin-svelte alone in eslint.config.js does not configure the skipped files.

## TESTS RUN

**Observation:** the exact focused command was:

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/sequence-viewer/viewer-transition-orchestration-contract.test.ts tests/unit/sequence-viewer/studio-surface-motion.test.ts tests/unit/sequence-viewer/transition-geometry-trace.test.ts tests/unit/sequence-viewer/transition-review-gates.test.ts tests/unit/3d-animation/staff-grip-contact-contract.test.ts tests/unit/3d/ember-production-slice-contract.test.ts tests/unit/viewer-3d-workbench-bootstrap.test.ts tests/unit/pictograph/torch-contrast.test.ts tests/unit/spatial-sculpture-motion.test.ts tests/unit/video-collaboration/sequence-videos-store.test.ts tests/unit/video-collaboration/step-map-utils.test.ts tests/unit/sequence-viewer/step-map-editor-blank-start.test.ts
```

Result lines (exit 1):

```text
FAIL tests/unit/3d-animation/staff-grip-contact-contract.test.ts > staff grip contact contract > uses the same upper-body stance plan as the production viewer
AssertionError: expected ... to contain 'resolveTrackedUpperBodyStance'
Test Files  1 failed | 11 passed (12)
Tests  1 failed | 133 passed | 1 todo (135)
Duration  15.39s
```

The passing 11 files are the other explicitly named files above. The repository reporter printed the aggregate pass count and the failed file, rather than separate passing-file lines.

**Observation:** lint/format commands used the changed paths while they were uncommitted:

```powershell
$changed = @(git diff --name-only -- '*.ts' '*.svelte')
npx eslint $changed
npx eslint --no-ignore $changed
npx prettier --check $changed
git diff --check
```

Results:

```text
eslint: exit 0; 18 problems (0 errors, 18 warnings)
warning: File ignored because of a matching ignore pattern.
eslint --no-ignore: exit 0; 18 problems (0 errors, 18 warnings)
warning: File ignored because no matching configuration was supplied
prettier --check: exit 0; All matched files use Prettier code style!
git diff --check: exit 0; no output
```

**Observation:** component syntax was additionally checked with this exact stdin program:

```powershell
@'
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
const files = execFileSync('git', ['diff', '--name-only', '--', '*.svelte'], { encoding: 'utf8' }).trim().split(/\r?\n/);
let warnings = 0;
for (const filename of files) {
  const result = compile(readFileSync(filename, 'utf8'), { filename, generate: 'client', dev: true });
  warnings += result.warnings.length;
}
console.log(`Svelte compile: ${files.length} files passed; ${warnings} existing/diagnostic warnings (not type-checked).`);
'@ | node --input-type=module -
```

Result: `Svelte compile: 18 files passed; 3 existing/diagnostic warnings (not type-checked).`, exit 0. The program's warning label does not establish when those warnings originated; only their count was inspected. This was compilation, not tsc or svelte-check.

## COMMITS

```text
29cf9e6c11 fix(types): w5-testc sequence-videos (1 errors)
6405d617ec fix(types): w5-testc sequence-viewer-transitions (9 errors)
025f29956f fix(types): w5-testc silk-2d-lab (7 errors)
70cee9a9bf fix(types): w5-testc silk-3d-lab (7 errors)
92d814a4a6 fix(types): w5-testc smart-collections (1 errors)
6768606508 fix(types): w5-testc spatial-sculpture (1 errors)
3ac7088676 fix(types): w5-testc staff-grip (3 errors)
8d535878d9 fix(types): w5-testc step-map-editor (2 errors)
7768a93476 fix(types): w5-testc torch-contrast (1 errors)
f6763d0628 fix(types): w5-testc viewer-3d (12 errors)
d89816b202 fix(types): w5-testc water-grotto (4 errors)
aad9986d29 fix(types): w5-testc water-traverse (4 errors)
73f120f20f fix(types): w5-testc winter-scene (13 errors)
128e9f0f03 fix(types): w5-testc worker-scene-switch (6 errors)
```

The ledger commit follows these code commits. All commits use explicit owned file pathspecs for staging and committing, with `git status --short` before every commit.
