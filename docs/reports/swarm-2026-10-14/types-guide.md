# Guide type lane — diagnostic snapshot 2026-10-14

## EVIDENCE AND SCOPE

Observation: branch `codex/swarm-types-guide`, worktree `E:/worktrees/tka-platform/swarm-types-guide`, base `d8f1a2a84d587a041294b26bfc510f3b8a4af067` (`Merge branch 'codex/ship-1015'`). The supplied list contains 83 diagnostics in 40 files. No full checker was run; the coordinator owns that verification.

Inference: the source changes address 67 listed diagnostics in 34 Svelte files; 16 native Snippet diagnostics remain. The table's **fixed** column records intended source corrections, not measured type-check clearance. Overall status is partial. The compile-helper scope violation below also breaches the brief's hard boundary.

Observation: commits contain only 34 owned Guide components, one owned regression test, and this ledger. No package files, other worktrees, primary-checkout paths, dependencies, or deployment state were intentionally edited. No install, full checker, tsc, build, dev server, merge, rebase, stash, reset, restore, clean, or push command was run.

## FILE LEDGER

| file                                                                                  | errors listed |  fixed |   left | note                                                                                    |
| ------------------------------------------------------------------------------------- | ------------: | -----: | -----: | --------------------------------------------------------------------------------------- |
| `src/routes/(public)/guide/level-1/_components/GuideCodexControls.svelte`             |             2 |      2 |      0 | Replace obsolete color props with required left/right hand props; runtime defect.       |
| `src/routes/(public)/guide/level-1/_components/GuideCover.svelte`                     |             2 |      2 |      0 | Motion arguments use ReturnType<typeof m>.                                              |
| `src/routes/(public)/guide/level-1/_components/GuideDocument.svelte`                  |             6 |      0 |      6 | Native content Snippet overloads; unchanged pending nested diagnostics.                 |
| `src/routes/(public)/guide/level-1/_pages/CompoundLettersPage.svelte`                 |             2 |      2 |      0 | Boolean anti flags on the cell constructor.                                             |
| `src/routes/(public)/guide/level-1/_pages/EightLetterWordsPage.svelte`                |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/FullReversalLoopsPage.svelte`               |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/GammaLettersPage.svelte`                    |             2 |      2 |      0 | HandSpec arguments on the cell constructor.                                             |
| `src/routes/(public)/guide/level-1/_pages/GammaLoopsPage.svelte`                      |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/HybridReversalsPage.svelte`                 |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/MixedWordsPage.svelte`                      |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/PropReversalLoopsPage.svelte`               |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/SixteenCountPage.svelte`                    |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/Type1LoopsPage.svelte`                      |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/Type2LoopsPage.svelte`                      |             2 |      2 |      0 | HandStep arguments on the local Step constructor.                                       |
| `src/routes/(public)/guide/level-1/_pages/Type2ShiftLettersPage.svelte`               |             2 |      2 |      0 | GridLocation arguments on startFor.                                                     |
| `src/routes/(public)/guide/level-1/book/+page@(public).svelte`                        |             2 |      0 |      2 | Native page Snippet assignments; unchanged.                                             |
| `src/routes/(public)/guide/level-1/print/+page@(public).svelte`                       |             1 |      0 |      1 | Native page Snippet assignment; unchanged.                                              |
| `src/routes/(public)/guide/level-2/[slug]/+page.svelte`                               |             2 |      2 |      0 | Coalesce optional neighboring array entries to null; both supplied diagnostics counted. |
| `src/routes/(public)/guide/level-2/_components/Level2Document.svelte`                 |             2 |      0 |      2 | Native content Snippet overloads; unchanged.                                            |
| `src/routes/(public)/guide/level-2/_pages/DividerOneTurnsPage.svelte`                 |             2 |      2 |      0 | Mandala motion arguments use ReturnType<typeof m>.                                      |
| `src/routes/(public)/guide/level-2/_pages/GlyphsPadsPage.svelte`                      |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/OneOneType1Page.svelte`                     |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/OneOneType23Page.svelte`                    |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/OneOneType456Page.svelte`                   |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/OpeningClosingPage.svelte`                  |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/SAndTPage.svelte`                           |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/TurnsPage.svelte`                           |             2 |      2 |      0 | Mandala motion arguments use ReturnType<typeof m>.                                      |
| `src/routes/(public)/guide/level-2/_pages/TwoTurnsShiftsPage.svelte`                  |             2 |      2 |      0 | Mandala motion arguments use ReturnType<typeof m>.                                      |
| `src/routes/(public)/guide/level-2/_pages/Type1DualShiftPage.svelte`                  |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/Type2ShiftPage.svelte`                      |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/Type3CrossShiftPage.svelte`                 |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/Type4DashPage.svelte`                       |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/Type5DualDashPage.svelte`                   |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_pages/Type6StaticPage.svelte`                     |             2 |      2 |      0 | MotionData arguments from the existing createMotionData factory.                        |
| `src/routes/(public)/guide/level-2/_sections/ch20/OneOneTurns.svelte`                 |             2 |      2 |      0 | MotionData arguments on the local step constructor.                                     |
| `src/routes/(public)/guide/level-2/_sections/ch20/OpeningClosing.svelte`              |             2 |      2 |      0 | MotionData arguments on the local step constructor.                                     |
| `src/routes/(public)/guide/level-2/_sections/ch20/SandT.svelte`                       |             2 |      2 |      0 | MotionData arguments on the local step constructor.                                     |
| `src/routes/(public)/guide/level-2/book/+page@(public).svelte`                        |             2 |      0 |      2 | Native page Snippet assignments; unchanged.                                             |
| `src/routes/(public)/guide/level-2/print/+page@(public).svelte`                       |             1 |      0 |      1 | Native page Snippet assignment; unchanged.                                              |
| `src/routes/(public)/guide/motion-paths/_components/MotionPathTransitionStage.svelte` |             3 |      1 |      2 | Annotate load identity string/null; two native crossfade Snippet props left.            |
| **Total (40 files)**                                                                  |        **83** | **67** | **16** | Source corrections require the coordinator's full-check confirmation.                   |

## RUNTIME DEFECTS

Observation: `GuideCodexControls.svelte` passed `color="blue"`/`color="red"` to `PropTurnsControl.svelte`, whose required prop is `hand: "left" | "right"`. `PropTurnsControl.svelte:201-202` selects the blue/red classes from `hand`; its button accessible names call `handLabel(hand)` (`control-labels.ts:4-5` returns the right label for every non-left value). With the missing hand, the left control announced the right hand and both controls lacked their hand class, while their callbacks still adjusted separate values.

Correction: pass `hand="left"`/`hand="right"` while preserving turn values, callbacks, geometry, and copy. This restores the intended hand identity and tone; no redesign was performed.

Observation: `tests/unit/guide/guide-codex-turn-controls.test.ts` is a two-case source-contract regression, not a browser rendering test. It checks that each control's hand, turns value, and mutation callback agree. It failed both cases against the original component and passed both cases after restoration of the fixed component. No other runtime defect was established from this diagnostic list.

## ROOT CAUSES

- Observation: 62 diagnostics are unannotated motion/helper parameters in 31 files. Use existing `HandStep`, `HandSpec`, `GridLocation`, booleans, `MotionData` returned by `createMotionData`, or `ReturnType<typeof m>` for the lightweight mandala motions. These are repeated local constructors, so no new shared abstraction was needed.
- Observation: two Codex diagnostics are stale component prop names, described above.
- Observation: two Level 2 topic-navigation diagnostics come from indexed access producing `undefined` under the project's array-index types. Existing bounds checks remain; `?? null` now matches the receiving component's nullable contract. No missing-neighbor dereference was established at runtime.
- Observation: one transition-stage diagnostic is the untyped callback forwarding `loadIdentity` to `markSequenceReady`; the callee and `InlineAnimationPlayer.svelte:391` both define `string | null`.
- Observation: edited files' rune imports now use `.svelte.js`. Component `.svelte` imports remain component imports. A source scan found zero edited-file rune imports still missing `.js`.
- Observation: existing `any`, non-null assertions, and `as` expressions were not expanded. A TypeScript AST count comparison found zero new occurrences of those escape hatches. No suppression comments or unknown-and-cast workaround were added.
- Observation: Prettier reformatted previously unformatted portions of the edited files. An in-memory comparison of all 34 components found identical normalized CSS and 32 identical compiled server outputs. The only two compiled behavior differences are the intended Codex prop fix and null-coalescing neighbor lookup; rune import specifiers and string-quote spelling were normalized for this comparison.

## LEFT

Observation: these 16 supplied diagnostics remain unchanged because their boundaries already use Svelte's native `Snippet` type. `level-1/_data/guide-manifest.ts` types `GuidePageMeta.content` as `Snippet`; document wrapper props use `Snippet<[GuidePageMeta]>`; the crossfade component takes native snippets. No honest local correction was established without nested checker diagnostics. Native compiler success does not establish type-check success.

| file                                                        | supplied lines | left |
| ----------------------------------------------------------- | -------------- | ---: |
| `level-1/_components/GuideDocument.svelte`                  | 190–194, 219   |    6 |
| `level-1/book/+page@(public).svelte`                        | 224, 232       |    2 |
| `level-1/print/+page@(public).svelte`                       | 58             |    1 |
| `level-2/_components/Level2Document.svelte`                 | 37, 49         |    2 |
| `level-2/book/+page@(public).svelte`                        | 208, 216       |    2 |
| `level-2/print/+page@(public).svelte`                       | 30             |    1 |
| `motion-paths/_components/MotionPathTransitionStage.svelte` | 358, 359       |    2 |

Observation: paths in this LEFT table are relative to `src/routes/(public)/guide/`; lines refer to the supplied snapshot. The motion-path file changed above those lines only to annotate the callback.

Inference: a toolchain/type-resolution identity issue may explain native Snippet return-type incompatibility, consistent with batch 1; this is not an established root cause. Proposal: coordinator captures complete nested overload/Snippet diagnostics and Svelte declaration resolution on its checking machine before changing contracts. No cast, wrapper erasing a Snippet brand, package edit, or checker configuration change was made.

## PACKAGE PROPOSALS

Observation: none established. All corrected parameter types come from existing local factories/domain types. There is insufficient evidence to specify a package change for the remaining Snippet diagnostics.

## TESTS RUN

Observation: tests used the required unit config with two workers and no persistent test process. To keep Vite/SvelteKit test output inside owned `tests/`, `tests/config/vitest.config.ts` temporarily set `cacheDir: "tests/.cache/swarm-types-guide/vite"` and passed `outDir: "tests/.cache/swarm-types-guide/kit"` directly to `sveltekit(...)`. The original config bytes were restored afterward, confirmed by `git diff --exit-code -- tests/config/vitest.config.ts` (exit 0). The first startup attempt incorrectly nested `outDir` under `kit` and failed with `config_kit_namespace`; moving it to the plugin's top level fixed startup. No temporary config change was committed.

```powershell
npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 tests/unit/guide/guide-codex-turn-controls.test.ts tests/unit/guide-turn-pages-contract.test.ts tests/unit/guide-level-2-topic-pages-contract.test.ts tests/unit/guide-level-2-topic-pages-ssr-guards.test.ts tests/unit/motion-paths-ssr-guards.test.ts tests/unit/prop-color-picker-contract.test.ts
# Test Files 6 passed (6)
# Tests 53 passed (53)
# exit 0

npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 tests/unit/guide/guide-codex-turn-controls.test.ts
# Against original component temporarily written from git show of the base:
# Test Files 1 failed (1); Tests 2 failed (2)
# Expected: hand="left" / hand="right"; received: color="blue" / color="red".
# Fixed component restored byte-for-byte in finally; final repeat:
# Test Files 1 passed (1); Tests 2 passed (2); exit 0

$guidePaths = @(git diff --name-only -- 'src/routes/(public)/guide')
npx eslint $guidePaths tests/unit/guide/guide-codex-turn-controls.test.ts
# 35 problems (0 errors, 35 warnings); exit 0
# All 35 files are ignored by existing eslint.config.js patterns; this is no lint coverage.
npx prettier --check $guidePaths tests/unit/guide/guide-codex-turn-controls.test.ts
# All matched files use Prettier code style!; exit 0

git diff --check
# No output; exit 0.
```

Observation: existing-test inventory found direct references to edited components in `guide-turn-pages-contract`, `guide-level-2-topic-pages-contract`, `guide-level-2-topic-pages-ssr-guards`, and `prop-color-picker-contract`; each ran. The motion-path SSR guard ran as the closest existing route contract. No sibling component test existed for the edited components. An initial test inventory scan stopped at a non-UTF-8 test file; repeating the inventory with replacement decoding completed it.

Observation: this exact in-memory compile command ran before committing:

```powershell
node --input-type=module -e "import {execFileSync} from 'node:child_process'; import {writeFileSync} from 'node:fs'; import {compileSvelteFiles} from './scripts/svelte-compile-gate.mjs'; const files=execFileSync('git',['diff','--name-only','--','src/routes/(public)/guide'],{encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('.svelte')); const results=await compileSvelteFiles(files); const failures=results.filter(r=>r.errors.length); writeFileSync('tests/.cache/swarm-types-guide/compile-results.json',JSON.stringify(results)); for(const r of failures) console.log(r.file,JSON.stringify(r.errors)); console.log('Svelte compile:',results.length,'files;',failures.length,'failures'); process.exitCode=failures.length?1:0;"
# Svelte compile: 34 files; 0 failures; exit 0
```

Observation: the compile helper emits a `[feature-gate] Production build...` message while loading the existing Vite config through preprocessing. No build command ran. This helper unexpectedly generated the directory documented under DEVIATIONS.

Observation: an additional comparison script lives in the ignored, uncommitted local artifact `tests/.cache/swarm-types-guide/verify-runtime-equivalence.mjs`. It directly calls `svelte/compiler` in memory against base/current source, fixes the CSS hash, canonicalizes string literals and import specifiers, compares printed JS, and formats CSS before comparison. Its command/results were:

```powershell
node tests/.cache/swarm-types-guide/verify-runtime-equivalence.mjs
# Compiled JS differences: 2 ["src/routes/(public)/guide/level-1/_components/GuideCodexControls.svelte","src/routes/(public)/guide/level-2/[slug]/+page.svelte"]
# CSS differences after formatting: 0 []
# Compared: 34 components (rune .svelte.js specifiers normalized; fixed CSS hash)
# exit 0
```

Observation: the first version of that optional comparison tried importing a non-top-level `esbuild` dependency and failed `ERR_MODULE_NOT_FOUND`; it was changed to the already available Prettier CSS formatter. No dependency was installed. A remaining string-quote-only compiled difference was resolved by canonicalizing string literal nodes, without changing source copy. Local JSON evidence is under `tests/.cache/swarm-types-guide/`; those ignored cache artifacts are not committed.

## DEVIATIONS

Observation: running the repository's `scripts/svelte-compile-gate.mjs` helper generated ignored `.svelte-kit/` output outside the owned paths while the preprocessor loaded Vite configuration. `Get-ChildItem -Force -Directory` reported `.svelte-kit` creation `10/15/2026 12:46:12 AM` and last write `12:46:13 AM` in the shell's displayed time. This is an unintended scope violation of the brief, even though the output is ignored and uncommitted. The directory was left untouched because deletion outside owned paths would compound the violation. Proposal: coordinator handles that generated directory; future lanes should use direct in-memory `svelte/compiler` calls or explicitly redirect preprocessor-triggered SvelteKit output before invoking this helper.

Observation: no browser or preview was started, as explicitly prohibited in this lane. Compiled output comparison supports the type-only scope; it does not replace visual inspection of the restored Codex tones or the coordinator's full type check. No integration was attempted because the swarm brief prohibits primary-checkout access and merging.

## IMPLEMENTATION COMMITS

- `5b1d71fcf82e952bb6d6638bce3dc06c7bb8460d fix(types): guide level-1 (28 errors addressed)`
- `882dbe8e7b8f796a3c855befa2fa198975ae110d fix(types): guide level-2 (38 errors addressed)`
- `d21d9762fdbe816dda07dd0175df16c8c56c21ba fix(types): guide motion-paths (1 error addressed)`
