# Shape matrix and animation engine type batch

## Evidence and scope

Observation: branch `codex/swarm-types-engine` began clean at `33a46f16076ec1751ff39bb3e1d59126762bb804`. The supplied list contains 59 diagnostics in 20 files. This report uses the requested batch label, 2026-10-14; tool execution occurred with the environment date 2026-10-15.

Inference: source corrections address 38 supplied diagnostics; 21 Snippet diagnostics remain. The table counts intended source corrections, **not measured checker clearance**. No svelte-check, tsc, full check, build, install, dev server, merge, push, or primary-checkout command was run. The coordinator must run the full checker on these commits.

Observation: tracked changes are confined to 13 listed Svelte files, one new test under tests/, and this ledger. An ignored generated-directory ownership violation is recorded below. Temporary edits to the two owned test configurations were restored byte-for-byte, verified with `git diff --exit-code -- tests/config/vitest.config.ts tests/config/vitest.components.config.ts` (exit 0). Configured Vitest caches and temporary verification configuration are under ignored `tests/.cache/types-engine/`; the supplemental compile helper also generated out-of-scope files described below. No package source was modified.

## OWNERSHIP VIOLATION

Observation: final artifact inspection found `.svelte-kit/` created in this worktree at 2026-10-15 01:52:33 local time, during the supplemental Svelte compilation command. Examples include `.svelte-kit/generated/build/app-manifest.js` (created/written 01:52:33) and `.svelte-kit/types/src/routes/watch/[...path]/$types.d.ts` (created/written 01:52:35). `git status --short --ignored -- .svelte-kit` returned `!! .svelte-kit/`.

Inference: the in-memory compilation helper's Vite preprocessor loaded the root Vite/SvelteKit configuration, whose setup generated these files. The root-config feature-gate message appeared in that command's output. No npm build or dev-server command was invoked.

Observation: `.svelte-kit/` is outside OWNED PATHS. This violates the brief's file-creation rule and invalidates the run under its stated condition, despite the tracked changes staying in scope. These generated files were not staged or deleted; deleting outside the owned paths would compound the violation. The earlier claim that all generated output was confined to tests/ was incorrect and is corrected here.

Proposal: the coordinator must decide whether to salvage the scoped commits and remove the generated directory under its own authorization. No new Austen approval is requested by this worker.

## File ledger

Observation: paths are relative to the worktree root. Original line numbers below refer to the supplied diagnostic snapshot.

| file                                                                                       | errors listed |  fixed |   left | note                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ------------: | -----: | -----: | ------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`                         |             1 |      0 |      1 | L966 native corner snippet; unchanged.                                                                                    |
| `src/lib/shared/animation-engine/components/CanvasSurface.svelte`                          |             2 |      2 |      0 | Arrow initializer retains the narrowed mounted element in nested callbacks.                                               |
| `src/lib/shared/animation-engine/components/CanvasSurfaceFireSwitchHarness.svelte`         |             1 |      1 |      0 | Use QualityTier.LOW; same runtime string.                                                                                 |
| `src/lib/shared/animation-engine/components/GlyphRenderer.svelte`                          |             1 |      1 |      0 | Explicit undefined returns on both paths without cleanup.                                                                 |
| `src/lib/shared/animation-engine/components/controls/settings-panel/VisualPane.svelte`     |             4 |      4 |      0 | End-label fallback shares the existing two-string tuple contract.                                                         |
| `src/lib/shared/animation-engine/components/effects-panel/EffectLookChips.svelte`          |             2 |      2 |      0 | Annotate dual-swatch snippet parameters as strings.                                                                       |
| `src/lib/shared/animation-engine/components/effects-panel/EffectQuickSwitch.svelte`        |             2 |      0 |      2 | L484/521 native portrait snippets; unchanged.                                                                             |
| `src/lib/shared/animation-engine/components/effects-panel/EffectsInspector.svelte`         |             2 |      2 |      0 | Non-LED branch already always passed paged=false; narrow selected/fallback fine control before reading its ID.            |
| `src/lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte`             |             2 |      0 |      2 | L820/910 native portrait snippets; unchanged.                                                                             |
| `src/lib/shared/animation-engine/components/effects-panel/thumbnails/FireThumbnail.svelte` |             9 |      9 |      0 | Model the four-color palette as a tuple throughout; interpolate the same three stop intervals without unchecked indexing. |
| `src/lib/shared/animation-engine/components/settings-panels/EffortPanel.svelte`            |             1 |      1 |      0 | Carry effort ID with its samples rather than indexing a parallel array.                                                   |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixAboutModal.svelte`                  |             1 |      0 |      1 | L52 native modal header snippet; unchanged.                                                                               |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixAppShell.svelte`                    |             7 |      1 |      6 | Adapt About click to a zero-argument call. Snippets at L430/431/479/480/632/644 remain.                                   |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixLiveRatioStage.svelte`              |            12 |     12 |      0 | Narrow regex capture and ring-buffer samples; iterate guide points directly; retain all three trail lanes.                |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixMatrixPane.svelte`                  |             1 |      0 |      1 | L64 native grid-corner snippet; unchanged.                                                                                |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixSurfaceControl.svelte`              |             1 |      0 |      1 | L59 native option-content snippet; unchanged.                                                                             |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryPane.svelte`                  |             1 |      0 |      1 | L98 native grid-corner snippet; unchanged.                                                                                |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixTurnPopover.svelte`                 |             1 |      1 |      0 | Include the existing linked-editor focus value both.                                                                      |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixValueScroller.svelte`               |             1 |      1 |      0 | Match SegmentedControl's blue/red/both/accent semantic tone union.                                                        |
| `src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte`                           |             7 |      1 |      6 | Capture the displayed non-null failure for its retry callback. Snippets at L1165/1166/1333/1334/1386/1387 remain.         |
| **Total**                                                                                  |        **59** | **38** | **21** | Full checker pending.                                                                                                     |

## RUNTIME DEFECTS

Observation: `ShapeMatrixAppShell.svelte` bound `onclick={appState.openAbout}`. `shape-matrix-app-state.svelte.ts:1043` accepts a focus argument, defaults it to null, then stores it as aboutFocus. A browser click therefore stored a MouseEvent in that domain field. The wrapper now invokes openAbout with zero arguments, preserving general-help focus. No visible crash from the old state pollution was reproduced.

Observation: `tests/unit/shape-matrix/about-button-focus.test.ts` extracts the actual About event binding, invokes it with a MouseEvent, and asserts that openAbout received no arguments. This exercises the event boundary without mounting the full shell. A direct method binding would fail this assertion.

Inference: capturing the displayed player-load failure also removes a potential mutable-null read between rendering and retry activation. That race was not reproduced, so this is not counted as an observed runtime defect.

## ROOT CAUSES

- Observation: noUncheckedIndexedAccess exposes arrays used as fixed-size tuples, correlated parallel arrays, regex captures, and typed-array reads. The corrections preserve real fixed sizes or narrow the values before use; no assertions or invented numeric fallbacks were added.
- Observation: getBilateralEndLabels already returns `[string, string]` in `src/lib/shared/pictograph/prop/domain/enums/prop-classification.ts:233`. The local fallback had widened the derived value to string[].
- Observation: `ShapeMatrixTheoryControls.svelte:13` includes both in RatioFocus, and `ShapeMatrixAppShell.svelte:225` already accepts both. Only the popover's intermediate callback declaration omitted it.
- Observation: `SegmentedControl.svelte:35` limits tone to blue/red/both/accent. ScrollerOption now states that same runtime contract.
- Observation: closure narrowing was lost at a nested function declaration and a delayed event callback. Arrow initialization and a template-local constant preserve the established non-null values.
- Observation: the effect cleanup callback returned a function on one path and fell through on another. Explicit undefined returns express the existing behavior.
- Observation: changed rune-module imports use .svelte.js as required by the brief. No unrelated import cleanup was performed.
- Observation: the EffectsInspector rich-panel branch excludes LED, so its old LED comparison was always false. Its selected control continues to fall back to the first available control.

## LEFT

Observation: all 21 remaining diagnostics are listed individually by original line numbers in the table. No source correction was established for these native Snippet seams:

- `CanvasSurface.svelte:242` already declares `cornerControl?: Snippet`.
- `EffectSelector.svelte:41` already declares `portrait?: Snippet<[string]>`.
- `BaseModal.svelte:88` already declares `header?: Snippet`.
- `DualSourceCrossfade.svelte:25-26` already declares `first: Snippet; second: Snippet`.
- `PanelGroup.svelte:20` already declares `content: Snippet`.
- `ShapeMatrixGrid.svelte:93` already declares `corner?: Snippet`.
- `SegmentedControl.svelte` already declares `optionContent?: Snippet<[T]>`.
- `LazyMount.svelte:61-63` already declares `placeholder?: Snippet` and `error?: Snippet<[unknown, () => void]>`.

Inference: native snippet return-marker incompatibilities may involve generated typing or module identity/toolchain resolution. Batch 1 documents the same unresolved pattern in `docs/reports/swarm-2026-10-14/svelte-check-batch-1.md:109`. Without the nested checker diagnostics, changing those valid contracts would be speculation. No casts, marker replacements, or weakened Snippet contracts were introduced.

Observation: no supplied diagnostic was independently established as ALREADY FIXED. The full checker was deliberately not run here.

Proposal: the coordinator should run the full checker on this branch and retain nested return-marker/module-resolution detail for the remaining Snippet errors. This is a verification task, not an Austen product decision.

## PACKAGE PROPOSALS

Observation: none established. No listed error justified a specific packages/\*\* edit from the available evidence. The unresolved Snippet evidence above does not establish a package defect.

## TESTS RUN

Observation: npm's cache was directed into the owned tree with `$env:npm_config_cache = "$PWD/tests/.cache/types-engine/npm"`. Vitest used `--configLoader runner` to avoid bundled configuration output through the shared node_modules junction; `--no-cache` and temporary cacheDir/outDir settings confined generated files. The component configuration temporarily selected IPv4 API ports 64229 and 64230 and disabled failure screenshots. Both tracked configurations were restored before commits.

### Unit tests

```powershell
npx vitest run --config tests/config/vitest.config.ts --configLoader runner --no-cache --maxWorkers 1 tests/unit/shape-matrix/about-button-focus.test.ts tests/unit/shape-matrix/shape-matrix-app-boundary.test.ts tests/unit/shape-matrix/shape-matrix-mandala-continuity-contract.test.ts tests/unit/shape-matrix/shape-engine-identity.test.ts tests/unit/shape-matrix/shape-matrix-transport-contract.test.ts tests/unit/shape-matrix-hero-pool-contract.test.ts tests/unit/shape-matrix-elemental-drill.test.ts tests/unit/shape-matrix-engine-contract.test.ts
# Test Files 7 passed (7)
# Tests 45 passed (45)
# exit 0
```

Observation: the transport-contract filename in this command does not exist and matched no suite. The other seven filters identify the seven executed files. An initial attempt with outDir inside a kit namespace failed at startup with `config_kit_namespace`; moving this temporary option to the plugin's top level allowed the run above.

### Browser component tests

```powershell
npx vitest run --config tests/config/vitest.components.config.ts --configLoader runner --no-cache --maxWorkers 1 src/lib/shared/animation-engine/components/CanvasSurface.svelte.test.ts src/lib/shared/animation-engine/components/CanvasSurface.fire-switch.svelte.test.ts src/lib/shared/animation-engine/components/layers/GlyphOverlay.svelte.test.ts
# Test Files 3 passed (3)
# Tests 15 passed (15)
# exit 0
```

Observation: the first browser attempt failed with `listen EACCES: permission denied ::1:63315` and ran no tests. Setting browser.api separately to IPv4 allowed the same command to execute. Passing output included the deliberate renderer-unavailable initialization test and missing test-server grid/prop SVG messages (404/offline); no asset changes were made. Vitest exited; no task-owned browser test server was retained.

### Svelte compilation

```powershell
node --input-type=module -e "import {compileSvelteFiles} from './scripts/svelte-compile-gate.mjs'; import {execFileSync} from 'node:child_process'; const files=execFileSync('git',['-c','core.safecrlf=false','diff','--name-only','--','src'],{encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('.svelte')); const results=await compileSvelteFiles(files); const failures=results.filter(r=>r.errors.length); for(const r of failures) console.log(r.file,JSON.stringify(r.errors)); console.log('Svelte compile:',results.length,'files;',failures.length,'failures'); process.exitCode=failures.length?1:0;"
# Svelte compile: 13 files; 0 failures
# exit 0
```

Observation: this compiled source in memory before committing. Later source edits only adjusted a comment and formatting. This is not a type-check result. Although component compilation happened in memory, preprocessing generated the out-of-scope .svelte-kit artifacts recorded above.

### ESLint

```powershell
$changedSource = git -c core.safecrlf=false diff --name-only -- src
npx eslint $changedSource tests/unit/shape-matrix/about-button-focus.test.ts
# 14 problems (0 errors, 14 warnings)
# ESLint exit: 0
```

Observation: `eslint.config.js:18,28` ignores all .svelte files and tests/. Every changed source/test was skipped. This command satisfies an exit-code check but provides no lint coverage. A supplemental `npx eslint --no-ignore $changedSource tests/unit/shape-matrix/about-button-focus.test.ts` failed with 13 Svelte parsing errors and a test-file parserOptions.project exclusion (exit 1). Existing configuration supplies TypeScript parsing without Svelte parsing when these ignores are bypassed.

Observation: a temporary Svelte-parser override under tests/.cache was also attempted with `npx eslint --config tests/.cache/types-engine/eslint.config.mjs $changedSource tests/unit/shape-matrix/about-button-focus.test.ts`. The first attempt had an incorrect relative config import (ERR_MODULE_NOT_FOUND); after correcting that, ESLint exited 2 because the inherited prefer-optional-chain rule requires type information unavailable for the excluded test. No lint rules or repository lint configuration were changed to conceal this limitation. Meaningful ESLint acceptance remains unverified.

### Formatting and restoration

```powershell
npx prettier --write $changedSource tests/unit/shape-matrix/about-button-focus.test.ts
npx prettier --check $changedSource tests/unit/shape-matrix/about-button-focus.test.ts
# All matched files use Prettier code style!
# Prettier final exit: 0
git diff --exit-code -- tests/config/vitest.config.ts tests/config/vitest.components.config.ts
# exit 0
git diff --check
# exit 0
```

Observation: the first formatting check found eight engine files needing formatting; the final write/check above passed. Ledger formatting is checked separately before its commit.

## COMMITS

Observation: implementation commits, oldest first:

- `ea5b6562b3` fix(types): engine canvas (4 errors)
- `6caa046c9f` fix(types): engine visual controls (4 errors)
- `c6740d9435` fix(types): engine effects panel (13 errors)
- `6c273ea7b7` fix(types): engine effort panel (1 error)
- `863ce9901a` fix(types): engine shape app (15 errors)
- `8d4510c363` fix(types): engine shape drill (1 error)

Observation: each commit used explicit git add paths and `git commit -m SUBJECT -- PATHS`, with git status --short before staging/commit. Integration and full type-checking remain with the coordinator under the swarm brief.
