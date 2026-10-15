# Picker port ledger

Observation: 2026-10-14. Branch `codex/swarm-picker-port`; starting HEAD `53ffc1da25be5710e9c0715bb0641101125ca039`; rescued tip `e2efb215fd6f953fe1a6c64fc5fe526097434b40`. Read `partial-compare.md` first, then inspected branch source with `git show` and `git diff main...codex/picker-transitions-wip -- <path>`. Only owned files were written. No integration, push, dependency install, dev server, full build, or type-check sweep was run.

## Status and ownership blocker

Observation: **partial**. Six approved images plus six provenance records are restored byte-for-byte. Centered prop swap is implemented and tested. Cache invalidation is incomplete because owned `src/lib/shared/3d/domain/fan-appearance.ts` does not exist. The actual URL owner is `src/lib/shared/pictograph/prop/domain/fan-appearance.ts:255,264`, outside owned paths. An unused file in the allowed directory would not change live URLs. No question was asked; remaining authorized work was completed.

Observation: no URL versioning change was made. `src/lib/shared/3d/domain/scene-prop-previews.test.ts` remains unchanged so expectations still describe actual outputs. Passing preview tests do not establish cache invalidation; existing browser/service-worker caches may retain the old captures.

Proposal: coordinator append `?v=2` to day/fire branches of actual `fanPreviewImage()`, preserving all newer fan variants and lotus `?v=6`. The exact rescued change is visible with `git diff main...codex/picker-transitions-wip -- src/lib/shared/pictograph/prop/domain/fan-appearance.ts`. Update the four expected URLs at `scene-prop-previews.test.ts:96-103` in the same change.

Observation: `rg -n 'fan-(day|fire).*complete|fan-\$\{' src` also found exact URLs in `src/lib/shared/pictograph/prop/domain/__tests__/fan-appearance.test.ts:114,117` and `src/routes/test/prop-size-audit/FireFanFidelityReview.svelte:37,44`. Both are outside ownership. Other matches name disk files or assert substrings.

Proposal: update those exact URL assertions and explicit fire review URLs consistently. Leave disk filenames and substring assertions alone. This is a coordinator ownership correction, not a new Austen product choice.

## Image hashes

Observation: used Python `subprocess.run(['git','show','codex/picker-transitions-wip:'+path], stdout=binary_file, check=True)` for binary-safe redirection, rather than PowerShell text redirection. Before is starting HEAD; after is `git hash-object <path>`, verified equal to `git rev-parse codex/picker-transitions-wip:<path>` for every row. All 12 match. Actual provenance names replace `.webp` with `.provenance.json`.

| Path                                                                                | Before                                     | After / rescued branch blob                | Result |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------ |
| `static/images/props/build-previews/fan-day-black-bare-complete.webp`               | `8dd482dd128a74070784dbddcc8665386e2cce5a` | `f08d6174cd9268219c6ed32f76b63074fc2d0115` | MATCH  |
| `static/images/props/build-previews/fan-day-black-bare-complete.provenance.json`    | `absent`                                   | `6f59de5122a721f029c1c7a66f5c3246d934d68a` | MATCH  |
| `static/images/props/build-previews/fan-day-black-covered-complete.webp`            | `55bfa482e2c499d6c3bf489133014812c8be0e9e` | `204cd2266c0dba62b1dd6711b7e1f66fc0eb893e` | MATCH  |
| `static/images/props/build-previews/fan-day-black-covered-complete.provenance.json` | `absent`                                   | `d3291f329e7771530c70971dccdb76866ffd15f8` | MATCH  |
| `static/images/props/build-previews/fan-day-white-bare-complete.webp`               | `f585cd6ee07c43530357a4d1064a8f59c97c298f` | `7048ea7db7fa6548f866d8a6ccc7e3bd28d1179f` | MATCH  |
| `static/images/props/build-previews/fan-day-white-bare-complete.provenance.json`    | `absent`                                   | `75fbe744567e4f8f78a50b216953c57f66a25116` | MATCH  |
| `static/images/props/build-previews/fan-day-white-covered-complete.webp`            | `89ddb4f9c824a6843f2aa7923eb68387b676782e` | `ba350ea0314170fec43541abed76ea883e2ff526` | MATCH  |
| `static/images/props/build-previews/fan-day-white-covered-complete.provenance.json` | `absent`                                   | `614d3fc77a930f4eea6f551dd8a72178704f56e0` | MATCH  |
| `static/images/props/build-previews/fan-fire-bare-complete.webp`                    | `28a56c296e61c126a8c0b61cd8a44c88694c4879` | `a8e6632e45927f54cea6aa63e0d4eca79dba6f34` | MATCH  |
| `static/images/props/build-previews/fan-fire-bare-complete.provenance.json`         | `absent`                                   | `394acc6253d3f65ed107e1303006d6773defcb2f` | MATCH  |
| `static/images/props/build-previews/fan-fire-covered-complete.webp`                 | `3dfe95dc80816ec407c2e24d517e0cba24763cd5` | `a4f020cf0c4d2469cd0560e82b47d27391e6d7c6` | MATCH  |
| `static/images/props/build-previews/fan-fire-covered-complete.provenance.json`      | `absent`                                   | `6221d1ff8f58db575ba31f63f2488cf1ddebe657` | MATCH  |

Observation: first extraction assumed `.webp.provenance.json` and stopped on the absent filename after copying one WebP. A second attempt stopped comparing a new provenance record to HEAD. No unintended files were created. The final loop handles absent records and verifies all twelve blobs.

## What the swap does

Observation: new artwork starts at its predecessor's width, stays centered at the same placement point, then eases to its natural size. `.prop-artwork` applies static centering with no transition. A separate `.prop-swap` group owns uniform scale; placement, rotation, mirroring, position cache, playback rotation settling and hand-color code remain authoritative on the existing owner. Selection-ring coordinates remain in their previous artwork space.

Observation: composition at rest remains `translate(position) rotate(angle) mirror translate(-center)`; during swap it is `translate(position) rotate(angle) mirror scale(ratio) translate(-center)`. This differs from the rescued branch by isolating scale in its own group, so snapping the new artwork's initial size does not disable outer placement/rotation easing. Ratio uses old/new center.x (half-width), as the branch did; invalid or nearly equal ratios become 1.

Observation: a colocated `PropSwapRelease` lifecycle class holds initial scale without transition until the second animation frame, then releases to 1. Rapid swaps and destroy cancel either pending frame; generation checks reject stale callbacks. `reducedMotion()` from the project's `shared/transitions/motion.ts` skips scale scheduling. Direct positioning and bulk transformations also skip the ease. CSS honors the reduced-motion media query. Fade opacity changes from 0.15 to 0.45. Fade timer uses package `DURATION.fast`; scale uses `DURATION.normal` and `EASE_STANDARD` from `@austencloud/motion`.

Observation: searched canonical capabilities for swap/double-frame, read existing PropSvg double-RAF positioning and rotation lifecycle. Decision: extend PropSvg's existing artwork swap owner with a small colocated ratio function/lifecycle class; reuse project preference helper and package constants. No picker, catalog, color or animation-engine owner was replaced.

## Main commits preserved

Observation: output from `git log main --since=2026-09-07 --format="%h %cs %s" -- src/lib/shared/pictograph/prop/components/PropSvg.svelte`:

```text
7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock
74eff7a000 2026-10-10 fix(pictograph): stop props spinning a full turn when motion playback ends
673b861620 2026-10-03 fix(composer): carry prop appearance into generated cards
3bca015b26 2026-09-13 fix(assemble): paint stage props with the user's chosen hand colors
60ddd3f910 2026-09-09 fix(props): preserve fan builds and material colors across renderers
```

Observation: `git show --stat 09a3d4f337` shows `fix(props): a prop tile redraws both hands when its prop changes size` changed `PropCompositionPreview.svelte` and `PropGridFamilyTile.svelte.test.ts`, not PropSvg. `git show --stat cab0028b30` shows `fix(props): paint 2D prop artwork in the user's chosen colors` changed PropCompositionPreview, color helper, loader, canvas and export owners, not PropSvg. Both `git merge-base --is-ancestor <sha> HEAD` commands exited 0. Those paths are untouched; existing PropSvg rendered-artwork/color override and playback settling logic remain in place.

## Verification

Observation: first explicit focused command supplied 18 paths, with these result lines: `Test Files 16 passed (16)` and `Tests 90 passed (90)`. It covered the new ratio/lifecycle tests, scene preview tests, fan build/grip/material/domain/loader/preparer suites and existing rotation handoff. Standard config excludes `**/*.svelte.{test,spec}.{js,ts}`, so supplied `PropSvg.svelte.test.ts` and `PropGrid.svelte.test.ts` were not executed. No browser-suite pass is claimed.

Observation: after adding composition coverage and rejecting a zero ratio from an infinite next width:

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/pictograph/prop-swap-scale.test.ts tests/unit/pictograph/prop-swap-composition.test.ts tests/unit/pictograph/prop-svg-motion-handoff.test.ts
```

Result: `Test Files 3 passed (3)` / `Tests 15 passed (15)`. Covers ratio, double-frame hold, both rapid-swap cancellation stages, both destruction stages, stale callbacks, reduced motion, actual component preference wiring, clickable and noninteractive mirrored composition, and existing playback-to-still rotation behavior.

Observation: final command discovers actual imports and includes both new tests:

```powershell
$existing = @(rg -l 'from .*fan-appearance|from .*PropSvg.svelte' src tests -g '*test.ts'); npx vitest run --config tests/config/vitest.config.ts tests/unit/pictograph/prop-swap-scale.test.ts tests/unit/pictograph/prop-swap-composition.test.ts src/lib/shared/3d/domain/scene-prop-previews.test.ts tests/unit/pictograph/prop-svg-motion-handoff.test.ts @existing
```

Result: `Test Files 12 passed (12)` / `Tests 68 passed (68)` / `Duration 18.23s`. Existing excluded browser-only suites remain unrun.

Observation: initial `npx eslint src/lib/shared/pictograph/prop/components/prop-swap-scale.ts tests/unit/pictograph/prop-swap-scale.test.ts` exited 0, but warned tests are ignored. Forcing tests with `--no-ignore` found 3 parser errors because the source-only tsconfig excludes tests. No repository lint configuration was changed.

Observation: all four changed TypeScript files were additionally linted with the same ESLint rules using a command-only parser override. Test files are outside the repository's source-only TypeScript project. Exact command:

```powershell
@'
import { ESLint } from 'eslint';
const files = ['src/lib/shared/pictograph/prop/components/prop-swap-scale.ts', 'tests/unit/pictograph/prop-swap-scale.test.ts', 'tests/unit/pictograph/prop-swap-composition.test.ts', 'tests/unit/pictograph/prop-swap-harness.svelte.ts'];
const eslint = new ESLint({ ignore: false, overrideConfig: { languageOptions: { parserOptions: { project: null, projectService: { allowDefaultProject: ['tests/unit/pictograph/prop-swap*.ts'] } } } } });
const results = await eslint.lintFiles(files);
const formatter = await eslint.loadFormatter('stylish');
process.stdout.write(formatter.format(results));
const errors = results.reduce((n,r) => n+r.errorCount,0);
const warnings = results.reduce((n,r) => n+r.warningCount,0);
console.log(`ESLint: ${files.length} files, ${errors} errors, ${warnings} warnings`);
process.exitCode = errors ? 1 : 0;
'@ | node --input-type=module -
```

Result: `ESLint: 4 files, 0 errors, 0 warnings`, exit 0. Only parser project inclusion changed; repository rules were retained.

Observation: formatting command (six provenance files included without modifying their bytes):

```powershell
$textFiles = @('src/lib/shared/pictograph/prop/components/PropSvg.svelte', 'src/lib/shared/pictograph/prop/components/prop-swap-scale.ts', 'tests/unit/pictograph/prop-swap-scale.test.ts', 'tests/unit/pictograph/prop-swap-composition.test.ts', 'tests/unit/pictograph/prop-swap-harness.svelte.ts', 'docs/reports/swarm-2026-10-14/picker-port.md') + @(git ls-files --others --exclude-standard static/images/props/build-previews/*.provenance.json); npx prettier --check @textFiles
```

Result: `All matched files use Prettier code style!`, exit 0. `git diff --check` exited 0 with no output. Ledger-only result text was formatted and rechecked before commit.

Observation: an attempted ledger update embedded a PowerShell here-string terminator inside an outer here-string. It failed with `SyntaxError: Unexpected identifier 'pathlib'`; no ledger replacement executed. Retried with the patch tool. No unowned files were written.

## LOOK CHECK

Proposal (not executed): coordinator should inspect the task version in its authorized browser/server after integration. The worker brief forbids starting a dev server or touching primary/other worktrees. Tests establish math and lifecycle, not visual acceptance.

1. Fan previews: open `/test/prop-3d-studio?prop=fan`, Performers -> performer -> fan build controls. Compare Day black/white x bare/covered and Fire bare/covered, checking wide-card fit and crop. After applying URL proposal, confirm Network requests carry `?v=2` in a previously cached session.
2. Centered swaps: use a 2D sequence in the sequence viewer (`/test/sequence-viewer-transitions` supplies a fixture), open Props rail and change Fan / Big Fan. Both hands should retain their colors and grow/shrink around their placement points, without a corner slide. Repeat rapidly, with mirrored/clickable picker props and playback-to-still handoff. Repeat with reduced motion: immediate final size, no scale ease. A 3D model swap does not exercise PropSvg.

Observation: cache invalidation, visual acceptance and coordinator integration remain outstanding. No Austen approval or product decision is required for this worker's scope.

## Delivery commits

Observation: scoped commits created after checking `git status --short` and staging/committing explicit owned paths:

- `6b8c50b56c` - `fix(props): restore approved fan preview captures` (12 assets/provenance files).
- `60e8bd04c0` - `fix(pictograph): ease artwork swaps around their center` (component, helper, two test suites and a reactive test harness).

Observation: the ledger is committed separately after these implementation commits. The coordinator owns integration and the outstanding URL-owner edit. No worktree or branch was removed.
