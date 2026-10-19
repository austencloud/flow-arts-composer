# types-w5-testb — 2026-10-18

## Scope and evidence

- **Observation:** started clean on `codex/swarm-types-w5-testb` at `2841631dcff0139d4bb8fc80cfc7a12dc34a4ac3` in `E:/worktrees/tka-platform/swarm-w5-testb`.
- **Observation:** changed only the owned route files, two local TypeScript helpers needed for listed errors, tests, and this ledger. No shared or package source changes, pushes, merges, installs, full checks, builds, or dev servers.
- **Inference:** the source fixes address all 62 supplied diagnostics across 18 components. The counts below map the supplied list to edits; they are **not** a new checker result. Full type-check confirmation belongs to the coordinator's run on the other machine.

## Error ledger

Paths below are relative to `src/routes/test/`.

| File                                                             | Errors listed |  Fixed |  Left | Note                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------: | -----: | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glossary-codex/+page.svelte`                                    |             3 |      3 |     0 | String option keys and value; parse the selected key back to a numeric index. Removed the incorrect string-to-number assertion.                                  |
| `goo-2d-lab/+page.svelte`                                        |             7 |      7 |     0 | Six existing modules need `.js` import specifiers; restored preset typing also covers the `item` callback.                                                       |
| `goo-3d-lab/+page.svelte`                                        |             7 |      7 |     0 | Same six-import root cause and inferred preset callback parameter.                                                                                               |
| `grip-lab/PoseHandles.svelte`                                    |             4 |      4 |     0 | Obtain DOM, scene, and scheduler through their dedicated Threlte hooks. Preserve direct Scene operations and invalidation.                                       |
| `grip-lab/PoseEditor.svelte`                                     |             1 |      1 |     0 | Pass a mutable array copy to SegmentedControl; keep literal handle types.                                                                                        |
| `grip-lab/+page.svelte`                                          |             2 |      2 |     0 | Pass mutable copies of hand/view options; use `.svelte.js` for the rune-module import.                                                                           |
| `hand-float-review/+page.svelte`                                 |             1 |      1 |     0 | Declare the cardinal ring as `GridLocation[]` so membership testing accepts a grid location.                                                                     |
| `ink-presets/InkProductionPreview.svelte`                        |             1 |      1 |     0 | Return `StepData \| StartPlacementData \| null`, matching the values already returned and AnimatorCanvas's `stepData` prop.                                      |
| `led-compare/+page.svelte`                                       |            10 |     10 |     0 | Resolve optional preset patches; narrow generator sources before reading `generatorId`; string option keys with number/boolean conversion at the event boundary. |
| `mandala-mobile/+page.svelte`                                    |             1 |      1 |     0 | Infer the current switcher's SelectableViewerMode callback type instead of restricting it to ContentType.                                                        |
| `mandala-palettes/+page.svelte`                                  |             2 |      2 |     0 | Type both stroke arguments as strings, matching the palette and color parser.                                                                                    |
| `negative-space-reach/ShoulderProbe.svelte`                      |             3 |      3 |     0 | Dedicated scene/scheduler hooks preserve render-stage sampling and infer traversal node types.                                                                   |
| `ocean-scene/HarnessToneMapping.svelte`                          |             6 |      6 |     0 | Dedicated `useRenderer<WebGLRenderer>()`; retain direct renderer access and effect cleanup.                                                                      |
| `ocean-scene/HarnessInspector.svelte`                            |             5 |      5 |     0 | Dedicated scene/renderer hooks preserve measurement, traversal, and grading.                                                                                     |
| `placements-concept/+page.svelte`                                |             2 |      2 |     0 | Type the two point indices as numbers.                                                                                                                           |
| `prop-3d-studio/capture/CaptureScene.svelte`                     |             1 |      1 |     0 | Local tested pattern helper supplies complete generator parameters when defaults use an image.                                                                   |
| `rainbow-scene/SceneProbe.svelte`                                |             5 |      5 |     0 | Dedicated scene/renderer hooks preserve diagnostics and infer child-object types.                                                                                |
| `sequence-actions/_components/SequenceActionsReviewFrame.svelte` |             1 |      1 |     0 | Local tested dispatcher factory uses the current `beginUndoSnapshot` transaction API.                                                                            |
| **Total**                                                        |        **62** | **62** | **0** | Source-level accounting; full checker not run in this lane.                                                                                                      |

## RUNTIME DEFECTS

1. **Observation:** `SequenceActionsReviewFrame.svelte` supplied `pushUndoSnapshot`, but `src/lib/features/create/shared/services/sequence-transform-action-dispatcher.ts` calls `deps.beginUndoSnapshot(...)` before executing a transform. **Inference:** review-frame actions reached the catch path before the requested transform ran. The route-local `review-transform-actions.ts` supplies a no-history transaction callback. Its test changes the sequence, finishes the transaction, and executes a second action; the dispatcher returns `completed` and invokes both operations.
2. **Observation:** CaptureScene's image-default branch supplied `{}` as generator parameters. `PatternParams` requires `primaryColor`, `speed`, and `brightness` in `src/lib/shared/poi/domain/strip-pattern.ts`. Current defaults use a generator, so this is a **latent** defect. **Inference:** switching the default to an image would produce incomplete capture parameters. `capture/led-capture-pattern.ts` preserves authored generator parameters and otherwise supplies the canonical LED colors, speed, and materialization brightness. Both branches are tested.

## ROOT CAUSES

- **Observation:** `SegmentedControl.svelte` declares `generics="T extends string"` and mutable `options: Option[]`. The glossary and LED pages supplied number/boolean keys, and grip controls supplied readonly tuples. Boundary conversions and mutable copies preserve the page state and displayed labels.
- **Observation:** `package.json` maps `#lib/*` to `./src/lib/*`. All twelve Goo module targets exist as `.ts` source. Neighboring imports use `.js` specifiers. **Inference:** extensionless imports explain the six unresolved imports plus callback cascade on each page.
- **Observation:** `src/types/global.d.ts:313` augments `@threlte/core` with scene and renderer `.current` wrappers and only camera/scene/renderer on its context. Installed `@threlte/core/dist/context/compounds/useThrelte.js` instead returns direct scene/renderer objects and DOM/scheduler properties; its dedicated hooks are exported by `dist/index.d.ts`. Changing working direct-object code to `.current` would contradict that runtime. The route fixes use `useScene`, `useRenderer`, `useDOM`, and `useScheduler`, whose types describe the installed runtime, while retaining the camera's actual `.current` access.
- **Observation:** AnimatorCanvas accepts start placements alongside numbered steps, LED pattern sources are a generator/image union, preset patches are optional, the viewer switcher includes modes beyond ContentType, and the transform dispatcher now takes an undo transaction factory. Harness declarations/calls had drifted from these owners.
- **Observation:** Prettier reformatted existing long lines in touched components. Formatting contributes to the diff size; no layout/style values were intentionally changed.

## LEFT

None of the supplied diagnostics is intentionally left unfixed. No missing-symbol deletion candidates were found. **Unverified:** whether the coordinator's full check clears every listed diagnostic or exposes any additional cascade.

## PACKAGE PROPOSALS

None. No `packages/**` changes are needed for these fixes.

## SHARED CODE PROPOSALS

- **Proposal, not implemented:** reconcile/remove the stale `declare module "@threlte/core"` augmentation at `src/types/global.d.ts:313` against installed Threlte's actual exported types. Preserve camera `.current` access and direct scene/renderer objects. Audit its other consumers before changing it. This lane uses specific exported hooks locally and does not modify the shared declaration.

## TESTS RUN

### Focused Vitest

```powershell
npx vitest run --config tests/config/vitest.swarm-types-w5-testb.config.ts --configLoader runner tests/unit/swarm-types-w5-testb/led-capture-pattern.test.ts tests/unit/swarm-types-w5-testb/review-transform-actions.test.ts tests/unit/negative-space-reach/contact-inspection-keyframes.test.ts
```

Observed result (exit 0):

```text
Test Files  3 passed (3)
     Tests  18 passed (18)
Duration  14.35s (transform 6.85s, setup 700ms, import 8.56s, tests 5.18s, environment 3.17s)
```

**Verification deviation:** the lane-specific config inherits the normal config's jsdom environment, setup, aliases, include/exclude rules, and browser resolution. It uses the standalone Svelte plugin instead of SvelteKit and stores Vite output in `tests/.cache/swarm-types-w5-testb`. The ordinary config's SvelteKit plugin writes `.svelte-kit`, outside ownership, and Vite's default cache follows the `node_modules` junction. `--configLoader runner` avoids bundling the config into that shared dependency directory. No test assertions or subject modules were replaced by this config.

### Lint and formatting

```powershell
$changedFiles = @(git diff --name-only -- '*.ts' '*.svelte')
$addedFiles = @(git ls-files --others --exclude-standard -- '*.ts')
npx eslint @changedFiles @addedFiles
npx prettier --check @changedFiles @addedFiles
```

These commands ran before the source commits, when those variables selected all 23 changed/new code/config/test files.

- **Observation:** ESLint exited 0: `21 problems (0 errors, 21 warnings)`. All 18 Svelte files and the three test/config paths were ignored by the repository's existing ESLint patterns. The two new route-local TypeScript helpers were linted. **Limitation:** the ordinary lint command does not provide Svelte lint coverage; no ignore rules were changed or warnings hidden.
- **Observation:** Prettier exited 0: `All matched files use Prettier code style!`.
- **Observation:** `git diff --check` emitted no whitespace errors before committing.

### Focused component compilation

This checks syntax/compilability, not TypeScript assignability. Exact command:

```powershell
@'
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compile, preprocess } from 'svelte/compiler';
import { svelteOptions } from './src/config/svelte-options.js';
const files = execFileSync('git', ['diff', '--name-only', '--', '*.svelte'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
for (const filename of files) {
  const source = await preprocess(readFileSync(filename, 'utf8'), svelteOptions.preprocess, { filename });
  compile(source.code, { ...svelteOptions.compilerOptions, filename, generate: 'client' });
}
console.log(`Svelte compile: ${files.length} changed components passed`);
'@ | node --input-type=module
```

Observed result (exit 0): `Svelte compile: 18 changed components passed`. Preprocessing also emitted existing Vite config compatibility warnings and a feature-gate production configuration message; no application build was invoked.

Full type checking, builds, and visual/browser checks were not run, as required by the worker brief. No appearance change is intended.

## COMMITS

Observed `git log --reverse --format="%h %s" 2841631dcff0139d4bb8fc80cfc7a12dc34a4ac3..HEAD` before the separate ledger commit:

```text
27a70e5fd9 test(types): isolate w5-testb verification outputs
bbe27336e9 fix(types): w5-testb glossary-codex (3 errors)
74a4b27097 fix(types): w5-testb goo-2d-lab (7 errors)
783e7b328f fix(types): w5-testb goo-3d-lab (7 errors)
a7f1cf03d9 fix(types): w5-testb grip-lab (7 errors)
157e556d56 fix(types): w5-testb hand-float-review (1 error)
ecfa9f28d1 fix(types): w5-testb ink-presets (1 error)
9c12d5c85f fix(types): w5-testb led-compare (10 errors)
185c352653 fix(types): w5-testb mandala-mobile (1 error)
42e7dccd9e fix(types): w5-testb mandala-palettes (2 errors)
72a480c0bf fix(types): w5-testb negative-space-reach (3 errors)
03b86567b2 fix(types): w5-testb ocean-scene (11 errors)
17b7103377 fix(types): w5-testb placements-concept (2 errors)
775ece58f6 fix(types): w5-testb prop-3d-studio (1 error)
4427995be2 fix(types): w5-testb rainbow-scene (5 errors)
a89940f7a4 fix(types): w5-testb sequence-actions (1 error)
```
