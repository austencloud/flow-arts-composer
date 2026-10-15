# Video editor branch salvage, 2026-10-14

## ASSESSMENT

Observation: this assessment was written before any implementation edits. Both assigned worktrees started clean on `codex/video-editor-salvage`. The app baseline is `1e90a22a93bbaffedc3848a58f71320306aff0e6`; the package baseline is `a7422e9b5f8251392bf8956c8b52795f768ee4b7`. Paths prefixed `package:` below are relative to `E:/worktrees/shared-packages/video-editor-salvage/packages/video-editor`; other paths are relative to the app worktree.

Observation: `git show -s --format=fuller f83d23b46c` describes the 2026-10-11 extraction as “Studio runs on the shared @austencloud/video-editor package.” The package README documents the generic editor and plugin boundary. The app's `package.json:330` requests `@austencloud/video-editor` `^0.1.2`; `package:package.json:3` is version `0.1.2`. Package release commit `e6c30432cdd53e018de3500c0bac56adae25f36a` predates the assigned package baseline. No package AGENTS.md was found by `rg --files -g AGENTS.md -g README.md packages/video-editor`.

Inference: Git patch uniqueness in the earlier branch report does not establish missing behavior after extraction. All six behaviors now have implementations in the current owners, with existing regression tests. No KEEP rebuild is needed. Estimated implementation size for each verdict is zero files; assessment and verification are the remaining work.

| Branch (tip)                                                        | What it does                                                                                                                                     | Already on main? Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Belongs in                                                                              | Verdict      | Reason                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `codex/post-crop-workflow` (`3142bf6307`)                           | Imported clips show crop, zoom, rotation and mirror changes live, switch between source edges and composition, and support ratio/reset controls. | Yes. `package:src/ui/editor/PostItemTool.svelte:272` switches to framing controls; `:340` handles source crop ratios; `:793` offers source view. `package:src/ui/editor/PostEditorWorkspace.svelte:2163` wires both callbacks; `package:src/ui/editor/PostEditorCanvas.svelte:2189` neutralizes framing only in source view. `package:src/ui/PostStudioMediaLayer.svelte:654` and `package:src/render/frame-compositor.ts:113` apply source rotation plus framing, scale and pan. `package:test/post-source-crop.test.ts:149` and `:166` already test ratio preservation and Original bounds.                           | Package                                                                                 | ALREADY-DONE | The branch's live crop behavior and tests survived extraction. Rebuilding would duplicate the current implementation.           |
| `codex/post-video-color-controls` (`e99bddd57c`)                    | Manually adjust brightness, contrast, saturation and hue; reset to original color.                                                               | Yes. `package:src/ui/editor/PostVideoColorTool.svelte` contains all four sliders and reset. `package:src/ui/editor/PostItemTool.svelte:203` preserves other grade fields on edit and `:995` wires the controls. `package:src/core/project/schema.ts:349` and `package:src/core/preset/preset-schema.ts:411` accept the expanded ranges; `package:src/core/color-grade.ts:21` emits the hue filter. `package:test/post-video-color-grade.test.ts:113` covers manual filter values.                                                                                                                                       | Package                                                                                 | ALREADY-DONE | Current package already implements the complete feature patch.                                                                  |
| `codex/post-video-auto-adjust` (`2ade24a55d`; feature `894ed39323`) | Analyze video and apply an automatic color grade.                                                                                                | Yes. `package:src/core/color-grade.ts` owns analysis; `package:src/ui/editor/PostItemTool.svelte:191` analyzes the selected source span and saves its grade; `package:src/ui/editor/PostVideoColorTool.svelte` exposes Auto adjust. `package:test/post-video-color-grade.test.ts:37` covers dark, bright, clipped and neutral footage.                                                                                                                                                                                                                                                                                  | Package                                                                                 | ALREADY-DONE | Feature is present. The remaining branch-tip edit only reshapes an old compiler test file; it adds no missing product behavior. |
| `codex/post-half-speed-start` (`39804a9a0a`)                        | Linked animation starts on the incoming take's clock during a crossfade, including its opening pose and slowed movement.                         | Yes. `src/lib/shared/post-studio-plugin/compile-hooks.ts:194` uses `timingVideoAt` for sequence pieces. `package:src/core/project/schema.ts:775` chooses the latest-starting covering video, while honoring an explicit anchor. `src/lib/shared/post-studio-plugin/ui/TkaMediaSublayer.svelte` passes the mapped beat; `ui/PostStudioSequenceAnimationLayer.svelte:227` consumes it and `:252` computes progress against that beat. `tests/unit/media-composition/post-project-compiler.test.ts:412` already contains the branch's incoming-opening-pose regression.                                                    | Both: generic timing selection in package; sequence compilation and rendering in plugin | ALREADY-DONE | The intended synchronization is present, with newer anchor handling that preserves an outgoing linked layer's own motion.       |
| `codex/post-pip-appearance` (`bd9eecb800`)                          | Per-item PiP props, display, path/effort and effects without changing neighboring items or global defaults.                                      | Yes. `src/lib/shared/post-studio-plugin/item-kinds.ts:176` gives Moves the animation appearance schema. `compile-hooks.ts:117` assigns scoped Moves an animation role. `ui/TkaKindTools.svelte:289` opens the scoped appearance tool; `ui/PostAnimationAppearanceTool.svelte:358` snapshots appearance and `:411` updates the selected item. `ui/PostStudioSequenceAnimationLayer.svelte:395` renders scoped props/effects. `tests/unit/media-composition/post-item-appearance.test.ts:15` checks isolation and serialization.                                                                                          | Plugin                                                                                  | ALREADY-DONE | Current plugin has the feature and further appearance support. The old layout is not needed.                                    |
| `codex/post-static-card-highlight` (`54a9b80bba`)                   | Standalone Choreo Cards have no active cell; playback-linked cards retain their mapped highlight.                                                | Yes. `src/lib/shared/post-studio-plugin/ui/post-card-highlight.ts` returns null for absent/nonfinite beats. `ui/PostStudioChoreoLayer.svelte:82` only shows a highlight when non-null; `ui/TkaMediaSublayer.svelte` renders cards without requiring a mapped beat. Outside owned paths, read-only evidence: `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte:138` and `state/viewer-studio-surfaces.svelte.ts:17` already handle nullable highlights. `tests/unit/media-composition/post-static-card-highlight.test.ts:13` already contains the branch regression against the extracted plugin. | Plugin, with already-completed viewer integration                                       | ALREADY-DONE | The exact behavior and regression test are already migrated. No viewer change is required.                                      |

## REBUILT

Observation: none. No implementation, test, locale, package version, or release-heading edits are needed for the six assessed branches. Existing regression tests are used for verification rather than duplicating them.

Observation: app changes consist only of this ledger. Package changes and feature commits: none. The ledger commit is reported to the coordinator in the final response.

### Verification

Observation: the following package command was run from `packages/video-editor` with caches disabled and the runner config loader to avoid writing through the shared node_modules junction:

```text
npx --no-install vitest run test/post-source-crop.test.ts test/post-video-color-grade.test.ts --configLoader runner --no-cache --no-fsModuleCache --maxWorkers 1
Exit 1
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite' imported from C:\Users\Austen\AppData\Local\npm-cache\_npx\69c381f8ad94b576\node_modules\vitest\dist\chunks\cli-api.Bx28WXzL.js
```

Observation: `Test-Path node_modules/.bin/vitest.cmd` in the package repo returned `False`. `--no-install` was used; dependencies were not installed. No Vitest test executed, and this run is not counted as passing.

Observation: the app's normal test config uses `sveltekit(svelteOptions)`. Its installed plugin writes `${out_dir}/generated/dev` from `configResolved` (`node_modules/@sveltejs/kit/src/exports/vite/index.js:551`), outside this brief's owned paths with the current config. The existing app suites were therefore not launched with that config. There are no added or touched tests whose passing status is required. The compiler and PiP test files cited above were inspected, not executed. No alternate runner config was introduced.

Observation: direct, cache-free Node assertions against the existing pure functions passed. These cover crop ratio/rotation/center, full-source reset, manual color filtering, legacy neutral hue, and standalone versus linked card highlights. They do not establish compiler integration, auto-analysis sampling, persistence or browser behavior.

Package command (PowerShell, from `packages/video-editor`):

```powershell
@'
import assert from 'node:assert/strict';
import { sourceCropAtRatio } from './src/ui/editor/post-source-crop.ts';
import { videoColorFilter } from './src/core/color-grade.ts';
const g = { x: 0.1, y: 0.2, width: 0.7, height: 0.6, rotation: 17, crop: { left: 0.2, right: 0.9, top: 0.1, bottom: 0.8 } };
const source = { width: 1920, height: 1080 };
const output = { width: 1080, height: 1920 };
const square = sourceCropAtRatio(g, source, output, 1);
assert.equal(square.rotation, 17);
assert.ok(Math.abs((square.crop.left + square.crop.right) / 2 - 0.55) < 1e-10);
assert.ok(Math.abs((square.crop.right - square.crop.left) * 1920 / ((square.crop.bottom - square.crop.top) * 1080) - 1) < 1e-10);
assert.ok(Math.abs(square.width * 1080 / (square.height * 1920) - 1) < 1e-10);
assert.deepEqual(sourceCropAtRatio(g, source, output, 1920 / 1080, true).crop, { left: 0, top: 0, right: 1, bottom: 1 });
assert.equal(videoColorFilter({ brightness: 0.75, contrast: 1.25, saturation: 0.5, hue: -90 }), 'brightness(0.75) contrast(1.25) saturate(0.5) hue-rotate(-90deg)');
assert.equal(videoColorFilter({ brightness: 1, contrast: 1, saturation: 1 }), 'none');
console.log('PASS: 7 crop ratio, source reset, and manual color assertions');
'@ | node --experimental-strip-types --input-type=module
```

```text
Exit 0
PASS: 7 crop ratio, source reset, and manual color assertions
```

App command (PowerShell, from app worktree root):

```powershell
@'
import assert from 'node:assert/strict';
import { postCardHighlightedStepIndex } from './src/lib/shared/post-studio-plugin/ui/post-card-highlight.ts';
for (const beat of [undefined, NaN, Infinity, -Infinity]) assert.equal(postCardHighlightedStepIndex(beat), null);
assert.equal(postCardHighlightedStepIndex(0), -1);
assert.equal(postCardHighlightedStepIndex(2), 1);
console.log('PASS: 6 standalone and linked card highlight assertions');
'@ | node --experimental-strip-types --input-type=module
```

```text
Exit 0
PASS: 6 standalone and linked card highlight assertions
```

Observation: `npx --no-install prettier --check docs/reports/swarm-2026-10-14/video-editor-salvage.md` passed with `All matched files use Prettier code style!`. ESLint has no changed `.ts` inputs in either repo. The package has no changed files for Prettier. No build, full check, browser inspection, install or dev server was run.

## DROPPED

Inference: no product feature should be dropped; all six are already implemented. The old-layout patches should not be reapplied.

Proposal: retire the obsolete test-file reshaping in `2ade24a55d` with its already-implemented auto-adjust branch. `git show 2ade24a55d -- tests/unit/media-composition/post-project-compiler.test.ts` changes only that test file, including formatting and unrelated test removal. Today's focused package color tests and plugin compiler regressions should remain. No branches or documentation were deleted.

## NEEDS PACKAGE RELEASE

Observation: this task produces no package changes and introduces no release dependency. Generic crop, manual color, auto color and timing selection already exist in the assigned package baseline, whose declared version is 0.1.2. `git diff --stat e6c3043..HEAD -- packages/video-editor` returned no output: the assigned package source matches its 0.1.2 release commit. The app is already configured to consume `^0.1.2`. No publish, version bump or dependency edit is proposed.

Limit: this is source and local-test verification, not a registry publish audit or a browser runtime inspection.

## LOOK CHECK

Observation: no new visible controls. No visual design decisions were made and no dev server was started.

Proposal: if the coordinator wants to inspect the existing surfaces, open Post Studio, select an imported video and open Crop (ratio, straighten, zoom, rotate, mirror, reset and Edit source crop), then Color (Auto adjust, Original color, brightness, contrast, saturation and hue). Select a Moves/PiP item and open Appearance for its scoped settings. Play across a take crossfade, then into a standalone Choreo Card, to inspect timing and highlight behavior. These are existing controls and behaviors, not additions from this task.

## OPEN QUESTIONS

Observation: no product decisions or approvals are needed. Visual acceptance has not been established; the brief assigns that inspection to Austen or the coordinating session.

Observation: full execution of the existing focused regressions remains unverified because of the runner and generated-file limits above. Proposal: the coordinator can run them in an environment with package-local test dependencies and permission for SvelteKit's generated files. This is verification follow-up, not missing salvage implementation.

Observation: integration and publishing are intentionally excluded. Both assigned branches and worktrees remain available for the coordinator; no other worktree is modified.
