# Types wave 4: shared app and non-test routes

Date: 2026-10-15. Branch: `codex/swarm-types-w4-shared`.
Starting commit observed: `355fbd527002109e947e18d055f45941580c3646`.

Observation: the supplied list contains 75 messages in 40 files. This change addresses 72 by source/type inspection and leaves 3. The full checker result is **not established**: tsc, svelte-check, full checks and builds were not run. The coordinator must verify the combined result on its check machine.

All source changes are in this worktree under owned shared app code and non-test routes. No pushes, merges, installations, dev servers, documentation deletions, or primary-checkout commands were performed. Vitest browser mode attempted its test server but failed before collecting tests.

## File inventory

Paths beginning `shared/` mean `src/lib/shared/`; `routes/` means `src/routes/`. “Fixed” means the source/type mismatch is addressed, pending the coordinator's full check. Unmodified consumers are included when a shared root fixes their diagnostic.

| File                                                                            | Errors listed |  Fixed |  Left | Note                                                                                        |
| ------------------------------------------------------------------------------- | ------------: | -----: | ----: | ------------------------------------------------------------------------------------------- |
| `shared/3d/components/Viewer3DScene.svelte`                                     |             2 |      0 |     2 | Dependency layers prop conflict; preserve scene.                                            |
| `shared/3d/environments/scenes/WinterScene.svelte`                              |             1 |      1 |     0 | Root: winter world option matches Three texture color-space type.                           |
| `shared/auth/components/AuthModal.svelte`                                       |             1 |      1 |     0 | Root: detector/config require only read access.                                             |
| `shared/auth/components/EmailLinkAuth.svelte`                                   |             1 |      1 |     0 | Same URL reader root.                                                                       |
| `shared/auth/components/SocialAuthCompact.svelte`                               |             3 |      3 |     0 | Same URL reader root.                                                                       |
| `shared/browse/components/FilterRuleStrip.svelte`                               |             1 |      1 |     0 | Detect optional browser function with typeof.                                               |
| `shared/components/placement-picker/MultiSelectPlacementPicker.svelte`          |             1 |      1 |     0 | Existing preset type on callback.                                                           |
| `shared/components/placement-picker/PlacementPickerGrid.svelte`                 |             1 |      1 |     0 | Empty interpolation for absent placement.                                                   |
| `shared/inbox/components/messages/ShareCollectionSheet.svelte`                  |             5 |      5 |     0 | Map ParticipantInfo.userId; extracted/tested selection.                                     |
| `shared/landing/components/SequenceHeroDemo.svelte`                             |             1 |      1 |     0 | Root: add already-emitted canvas-ready mark to LandingMark.                                 |
| `shared/modules/ModuleRenderer.svelte`                                          |             1 |      1 |     0 | Capture and guard loader registry entry.                                                    |
| `shared/navigation/components/DesktopNavigationSidebar.svelte`                  |             1 |      1 |     0 | ModuleDefinition callback.                                                                  |
| `shared/navigation/components/MobileNavigation.svelte`                          |             2 |      2 |     0 | Section callbacks.                                                                          |
| `shared/navigation/components/ModuleSwitcher.svelte`                            |             3 |      3 |     0 | ModuleDefinition callbacks.                                                                 |
| `shared/navigation/components/account/MyPropsDrawer.svelte`                     |             1 |      1 |     0 | Only look up a family when initial prop exists.                                             |
| `shared/notation/qft/components/QftFlowerPicker.svelte`                         |             1 |      1 |     0 | Actual QFT_FLOWERS caller uses RotatingFlower[].                                            |
| `shared/pictograph/arrow/rendering/components/ArrowSvg.svelte`                  |             1 |      1 |     0 | Mapper returns cw/ccw/null, never auto.                                                     |
| `shared/pictograph/grid/components/PropPlacementGrid.svelte`                    |             2 |      2 |     0 | Placement-complete arguments are GridLocation.                                              |
| `shared/pictograph/prop/components/PropCompositionPreview.svelte`               |             5 |      5 |     0 | Fallback uses existing PropTileArtwork contract.                                            |
| `shared/pictograph/tka-glyph/components/TurnsColumn.svelte`                     |             1 |      1 |     0 | Explicit undefined return for synchronous effect branch.                                    |
| `shared/post-studio-plugin/ui/PostAnimationAppearanceTool.svelte`               |             1 |      1 |     0 | Rune import uses .svelte.js.                                                                |
| `shared/post-studio-plugin/ui/PostStudioSequenceAnimationLayer.svelte`          |             1 |      1 |     0 | Same rune import fix.                                                                       |
| `shared/sequence-preview/components/SequenceShowcasePreview.svelte`             |             2 |      2 |     0 | Declare sequence before dependent clip durations.                                           |
| `shared/share/components/LiveExportCard.svelte`                                 |             1 |      1 |     0 | Normalize absent colors to undefined.                                                       |
| `shared/share/components/PostShareSheet.svelte`                                 |            10 |     10 |     0 | Six numeric control errors share generic root; four card branches unreachable in video arm. |
| `shared/share/components/post-studio/builder/PostTimingAnimationPreview.svelte` |             2 |      2 |     0 | Root: infer complete mapped frame instead of erasing populated fields.                      |
| `shared/share/components/post-studio/builder/PostTimingTimeline.svelte`         |             1 |      1 |     0 | Narrow select to three existing speed literals.                                             |
| `shared/ui/components/AsyncSuggestionCombobox.svelte`                           |             1 |      1 |     0 | Structural isComposing guard without assertion.                                             |
| `shared/ui/components/ValueSlider.svelte`                                       |             3 |      3 |     0 | Fixed two-string endpoint tuple.                                                            |
| `routes/(dev)/video-collab-demo/+page.svelte`                                   |             1 |      1 |     0 | Required empty fixture associations/performers arrays.                                      |
| `routes/(public)/atlas/_components/KineticAtlasDraft.svelte`                    |             1 |      1 |     0 | Real placement key; extracted/tested insertion.                                             |
| `routes/(public)/atlas/_components/LetterCodex.svelte`                          |             2 |      2 |     0 | Missing per-grid flags default false.                                                       |
| `routes/(public)/composer/_sections/ConstructSection.svelte`                    |             1 |      0 |     1 | Player does not implement requested playback lifecycle.                                     |
| `routes/(public)/guide/three-levels/+page.svelte`                               |             1 |      1 |     0 | Current $app/env import.                                                                    |
| `routes/(public)/history/+page.svelte`                                          |             1 |      1 |     0 | Current $app/env import; update matching source assertion.                                  |
| `routes/(public)/notation/caps/_components/YutaCapLiveDemo.svelte`              |             1 |      1 |     0 | Pass existing clubTipDx to floor.                                                           |
| `routes/+layout.svelte`                                                         |             1 |      1 |     0 | Root: object plus property guards accepts package NavigationLike.                           |
| `routes/q/[code]/+page.svelte`                                                  |             1 |      1 |     0 | Empty canonical suffix when code absent; valid routes unchanged.                            |
| `routes/q/[code]/QScanPage.svelte`                                              |             3 |      3 |     0 | Shared read-only URL readers and iterable clone input.                                      |
| `routes/sequence/[id]/SequenceViewerPage.svelte`                                |             5 |      5 |     0 | URL helper roots, optional route-id reader, narrowed snippet sequence snapshot.             |
| **Total**                                                                       |        **75** | **72** | **3** | Full checker deferred.                                                                      |

## RUNTIME DEFECTS

- **Observation:** `ParticipantInfo` declares `userId` in `src/lib/shared/messaging/domain/models/conversation-models.ts:18`. The old recent-people loop tested `person.id`, discarding ordinary direct-message participants before they appeared in collection sharing. Fix maps `userId` to the existing selection model's `id`, preserving exclusions, deduplication, ordering, fallback name and limit. `recent-collection-recipients.test.ts`: 2 passing tests.
- **Observation:** Atlas `+page.server.ts:29` emits `placement`; the old insertion loop searched for `position`. The codex therefore appeared first even with placements present. `codex-navigation.test.ts` verifies the corrected insertion, filtered/empty results and input immutability: 2 passing tests.
- **Observation:** `MandalaHeroLayer` requires `tipDx` for scale. `YutaCapLiveDemo` already computes paths using `clubTipDx = 150` but omitted it from the floor. Fix passes that value. **Inference:** the omission could misalign or invalidate sizing; visible geometry was not established because no dev server is permitted and browser tests failed to bind. This wiring is component-owned rather than an independent calculation.
- **Observation:** `SequenceShowcasePreview` declared sequence after a derived expression referencing it. The ordering now agrees with the dependency. A prior runtime failure is **not established**: Svelte derives values lazily, so this primarily resolves the reported TS diagnostics.

## ROOT CAUSES

- URL readers now require `Pick<URLSearchParams, "get">`; scan builders require `Iterable<[string, string]>` because they copy parameters before mutation. Roots: `auth/services/in-app-browser-detector.ts`, `auth/config/app-availability.ts`, `navigation/services/sequence-encoder.ts`, `qr/services/card-scan-ingest.ts`, `qr/services/scan-app-handoff.ts`, `qr/services/scan-sequence-handoff.ts`. These resolve auth and QR/viewer cascades without call-site assertions or route URL mutation.
- Three renderer and texture color-space properties are strings. Winter's option and local loader parameter now use `Texture["colorSpace"]`, preserving the actual accepted runtime value, including registered color spaces. The focused winter-world test passed.
- `SegmentedControl` runtime already supports numeric equality, keys, attributes and callbacks. Its generic now accepts `string | number`, clearing six resolution/FPS diagnostics without conversion or changed options.
- `post-timing-session.svelte.ts` builds complete sequence frames but erased populated fields through `$derived<PaintFrame | null>` (the package also represents non-sequence layers). Infer the concrete value and validate with `satisfies PaintFrame`, retaining required sequenceFrame/sequencePosition. No package edits or render fallback. Touched timing imports use `.svelte.js`.
- Prop artwork's plain fallback had a narrower inferred shape lacking optional fill. Its existing PropTileArtwork annotation fixes all five accesses without changing artwork.
- `isShallowGoto`'s all-optional shape had no common property with package NavigationLike. An object parameter and `in` guards preserve existing classification while accepting the erased package view.
- Remaining changes expose existing callback, return, tuple and missing-metadata contracts; normalize absent dictionary/optional values; fix import migration; and preserve narrowing inside a deferred snippet. Removing the four unreachable card conditions in the video-only footer preserves its actual text and attributes.

## LEFT

1. `src/lib/shared/3d/components/Viewer3DScene.svelte:676,740` (2). **Observation:** `node_modules/@threlte/extras/dist/layers/plugin.svelte.js` supports arrays and propagates membership through threlte-layers-context. The intended array is `[BASE_SCENE_LAYER, PROTECTED_PERFORMER_LAYER]`, i.e. `[0, 7]`. Core's `dist/components/T/types.d.ts` infers the prop from Layers.set(layer), yielding number or a single-element tuple. **Inference:** dependency typing mismatch. Reducing it to one layer would remove intended inherited membership. No assertion or scene change added.
2. `src/routes/(public)/composer/_sections/ConstructSection.svelte:681` (1). **Observation:** caller supplies playbackAllowed and resumeWhenPlaybackAllowed, but `shared/sequence-viewer/components/AnimationPlayer.svelte` declares/implements neither. A different InlineAnimationPlayer implements both. **Inference:** the caller's requested gate is currently ignored. Adding unused prop types would bless a nonfunctional contract; deleting the props hides the defect. Correct work requires implementing/testing pause/resume, asynchronous initialization and pending autoplay, or deliberately changing the embedding player. That lifecycle change remains for the coordinator rather than substituting a type-only no-op.

## PACKAGE PROPOSALS

- No `packages/**` files were changed or require a local package patch for the completed fixes.
- **Proposal (external dependency):** in @threlte/core Props composition, extension props should override matching inferred instance keys: use `Omit<InstanceProps<Type>, keyof Threlte.UserProps>` instead of intersecting those instance keys unchanged with UserProps. Extras should declare `layers?: ThrelteLayers` in the extension interface for plugin users. Verify inherited `[0, 7]` membership for nested performer/effect objects. This is unimplemented and needs dependency-owner review plus a compatible dependency update, not a local cast.

## TESTS RUN

Exact command batches and observed output follow. No full checker ran.

### Unit batch A

```powershell
npx vitest run --config tests/config/vitest.config.ts --maxWorkers=2 src/lib/shared/inbox/components/messages/recent-collection-recipients.test.ts 'src/routes/(public)/atlas/_components/codex-navigation.test.ts' tests/unit/auth/in-app-browser-detector.test.ts tests/unit/auth/in-app-browser-detector.native.test.ts tests/unit/auth/app-availability.test.ts tests/unit/qr/scan-sequence-handoff.test.ts tests/unit/qr/scan-app-handoff.test.ts tests/unit/qr/physical-card-scan.test.ts tests/unit/navigation/url-state.test.ts src/lib/shared/navigation/services/__tests__/sequence-encoder.legacy-qr.test.ts src/lib/shared/navigation/services/sequence-encoder.short-code.test.ts src/lib/shared/navigation/services/__tests__/sequence-route-id.test.ts tests/unit/3d-worker-renderer/winter-environment-world.test.ts tests/unit/ui/value-slider.test.ts tests/unit/sequence-preview/sequence-showcase-preview-prop-contract.test.ts tests/unit/inbox/inbox-inline-sequence-player-contract.test.ts tests/unit/module-renderer-performance-contract.test.ts tests/unit/prop-studio-lightweight-bootstrap.test.ts tests/unit/atlas-entrypoint-language.test.ts tests/unit/glossary-production-gate.test.ts tests/unit/media-composition/post-timing-animation.test.ts tests/unit/media-composition/post-animation-effects.test.ts src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-orientation-transition.test.ts src/lib/shared/pictograph/prop/domain/__tests__/prop-look.test.ts tests/unit/create/generate/placement-selection.test.ts
```

Exit 0: `Test Files 25 passed (25)`; `Tests 170 passed (170)`.

### Unit batch B and assertion correction

```powershell
npx vitest run --config tests/config/vitest.config.ts --maxWorkers=2 tests/unit/media-composition/post-timing-video-release.test.ts tests/unit/media-composition/post-timing-step-playback.test.ts tests/unit/media-composition/post-timing-keys.test.ts tests/unit/media-composition/take-timing-lane.test.ts tests/unit/landing-constrained-performance-contract.test.ts tests/unit/landing-route-morph.test.ts tests/unit/landing/hero-word-header.test.ts tests/unit/landing-directions-contract.test.ts tests/unit/homepage-hero-notation-contract.test.ts tests/unit/caps-page-plain-contract.test.ts tests/unit/notation-roots-remediation-contract.test.ts tests/unit/history-4k-layout-contract.test.ts 'src/routes/(public)/atlas/_components/codex-navigation.test.ts'
```

Initial exit 1: `Test Files 1 failed | 12 passed (13)`; `Tests 1 failed | 105 passed (106)`. Single failure asserted the retired $app/environment spelling in the changed history route. Updated that owned test to require $app/env, then ran:

```powershell
npx vitest run --config tests/config/vitest.config.ts --maxWorkers=2 tests/unit/notation-roots-remediation-contract.test.ts
```

Exit 0: `Test Files 1 passed (1)`; `Tests 17 passed (17)`. Other batch-B files were passing and not rerun. Existing accessibility warnings came from unmodified TakeTimingLane.svelte:147.

### Browser tests: infrastructure blocked

```powershell
npx vitest run --config tests/config/vitest.components.config.ts --maxWorkers=1 src/lib/shared/browse/components/FilterRuleStrip.svelte.test.ts src/lib/shared/navigation/components/ModuleSwitcher.svelte.test.ts src/lib/shared/pictograph/grid/components/PropPlacementGrid.svelte.test.ts src/lib/shared/post-studio-plugin/ui/PostAnimationAppearanceTool.svelte.test.ts src/lib/shared/ui/components/SegmentedControl.svelte.test.ts
npx vitest run --config tests/config/vitest.components.config.ts --maxWorkers=1 --browser.api.host=127.0.0.1 --browser.api.port=6250 src/lib/shared/browse/components/FilterRuleStrip.svelte.test.ts src/lib/shared/navigation/components/ModuleSwitcher.svelte.test.ts src/lib/shared/pictograph/grid/components/PropPlacementGrid.svelte.test.ts src/lib/shared/post-studio-plugin/ui/PostAnimationAppearanceTool.svelte.test.ts src/lib/shared/ui/components/SegmentedControl.svelte.test.ts
npx vitest run --config tests/config/vitest.card-mcp-parity.config.ts --maxWorkers=1 tests/render-parity/live-card-qr-readiness.test.ts tests/render-parity/live-card-png-parity.test.ts tests/render-parity/download-card-lifecycle.test.ts
```

All reported `Error: listen EACCES: permission denied ::1:63315`; `Test Files no tests`; `Errors 1 error`. **Observation:** CLI host/port override still reported the default address; the reason was not established. Component runs exited 1 and reported close timeouts before exiting. Card/share browser parity was not established. No other task's process or server was changed.

### Lint, formatting and syntax

Before commits, changed code paths were expanded with:

```powershell
$changedPaths = @(git -c core.safecrlf=false diff --name-only -- '*.ts' '*.svelte') + @(git ls-files --others --exclude-standard -- '*.ts' '*.svelte')
npx eslint -- @changedPaths
```

Initial exit 0: `32 problems (0 errors, 32 warnings)`. Each warning says a Svelte file was ignored: eslint.config.js explicitly ignores `**/*.svelte`. TypeScript paths were checked. Final lint/formatting evidence will be appended before the ledger commit.

Final repetition after the last source/test edits: exit 0, `33 problems (0 errors, 33 warnings)`. The additional ignored path is the updated `tests/unit/notation-roots-remediation-contract.test.ts`; the repository also ignores `tests/`. New co-located regression tests were linted.

```powershell
$changedPaths = @(git -c core.safecrlf=false diff --name-only) + @(git ls-files --others --exclude-standard)
npx prettier --check -- @changedPaths
git -c core.safecrlf=false diff --check
```

Prettier exit 0: `All matched files use Prettier code style!`. Diff check exit 0, no output.

An in-memory compilation of the 32 changed Svelte files used `compile(readFileSync(file, 'utf8'), { filename: file, generate: 'client', dev: true })` from svelte/compiler, iterating `git diff --name-only -- '*.svelte'`. Exit 0: `Svelte syntax compilation: 32/32 passed (no type checking)`. No emitted files were written.

Exact syntax-compilation command, repeated after the last Svelte edit with the same passing result:

```powershell
@'
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
const files = execFileSync('git', ['diff', '--name-only', '--', '*.svelte'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
let failures = 0;
for (const file of files) {
  try { compile(readFileSync(file, 'utf8'), { filename: file, generate: 'client', dev: true }); }
  catch (error) { failures++; console.log(`${file}: ${error.message}`); }
}
console.log(`Svelte syntax compilation: ${files.length - failures}/${files.length} passed (no type checking)`);
process.exitCode = failures ? 1 : 0;
'@ | node --input-type=module
```

## Delivery and deviations

- Per worker brief, commits remain on this branch; no integration or push.
- Three messages remain as described. Browser verification is blocked. No request for an Austen decision or approval was made.
- Required Prettier formatting touched existing formatting within owned files. No copy or CSS was intentionally changed.

## Implementation commits

- `5dae23136b37` fix(types): w4-shared 3d color-space contract
- `641280681f1f` fix(types): w4-shared auth read-only URL readers
- `78ddd4935f70` fix(types): w4-shared browse browser capability guard
- `010953e828fb` fix(types): w4-shared placement-picker contracts
- `cd216a52b0cd` fix(types): w4-shared inbox recipient identity
- `be36aea18634` fix(types): w4-shared modules loader narrowing
- `6fb904356368` fix(types): w4-shared navigation contracts
- `1f4571328ccc` fix(types): w4-shared notation rotating flower input
- `7bc4fbb3175a` fix(types): w4-shared performance canvas-ready mark
- `0f2414343171` fix(types): w4-shared pictograph contracts
- `34d6c7ac1feb` fix(types): w4-shared post-studio rune imports
- `9642f8dd9d25` fix(types): w4-shared qr read-only handoff inputs
- `b4fc67a3c39b` fix(types): w4-shared sequence-preview declaration order
- `fc36ca9d3e12` fix(types): w4-shared share frame and option contracts
- `37b1865fd431` fix(types): w4-shared ui value and event contracts
- `1cd06035cbce` fix(types): w4-shared routes contracts and codex placement
