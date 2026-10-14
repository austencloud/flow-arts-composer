# Svelte check batch 1 — 2026-10-14

## Evidence and scope

Observation: worktree branch `codex/swarm-svelte-check`; implementation started at `46285ef0cc50a1028f589f4af3f12ffe5755cc9c` (`Merge branch codex/zans-diamond-guide`). The input file claims diagnostics from `e700c9bee6`, so the supplied diagnostic snapshot and this worktree base are different commits.

Observation: parsing `.svelte-batch-1.md` produced **180 diagnostics in 68 paths**, despite its header and the brief saying 181/69. The input remains untracked and was never staged.

Inference: source corrections address **122** supplied diagnostics; **58** remain intentionally unresolved (56 Snippet/overload diagnostics, two external rig state diagnostics). The table's `fixed` column counts intended source corrections, **not measured checker clearance**. No svelte-check, tsc, build, install, dev server, merge, push, or primary-checkout operation was run. The coordinator must run the full checker on these commits.

Observation: all authored changes are in owned paths. Test configurations were temporarily edited only under `tests/` to confine generated caches/output and choose a working browser port; both were returned byte-for-byte to their tracked content, verified with `git diff --exit-code -- tests/config/vitest.config.ts tests/config/vitest.components.config.ts` (exit 0).

## File ledger

| file                                                                                                     | errors listed | fixed | left | note                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------: | ----: | ---: | ------------------------------------------------------------------------------------------------------------- |
| `src/lib/features/browse/collections/components/MyCollectionsPanel.svelte`                               |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte`                      |             1 |     1 |    0 | Use the drill catalog Section for emitted screens.                                                            |
| `src/lib/features/browse/collections/components/WorkShelfRail.svelte`                                    |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/browse/gallery-home/FilterWorkspace.svelte`                                            |             4 |     3 |    1 | String callback boundary; map collections to collection; Snippet remains.                                     |
| `src/lib/features/browse/gallery-home/GalleryWorkspace.svelte`                                           |            12 |     0 |   12 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/browse/gallery-home/value-editors/GalleryFamilyEditor.svelte`                          |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/browse/gallery-home/value-editors/GalleryLoopEditor.svelte`                            |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/browse/shared/components/BrowseModule.svelte`                                          |             4 |     3 |    1 | Create mutable URLSearchParams copies for the parser; Snippet remains.                                        |
| `src/lib/features/create/construct/option-picker/components/OptionCard.svelte`                           |             1 |     1 |    0 | Empty-letter interpolation uses an empty string.                                                              |
| `src/lib/features/create/construct/option-picker/components/OptionPickerDesktopLayoutHarness.svelte`     |             1 |     1 |    0 | Annotate section title callback.                                                                              |
| `src/lib/features/create/construct/option-picker/swipe-layout/components/OptionViewerSwipeLayout.svelte` |             3 |     2 |    1 | Annotate section/index callback; Snippet remains.                                                             |
| `src/lib/features/create/generate/components/cards/LoopRhythmConfigurator.svelte`                        |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/create/generate/components/cards/LoopSelectionSummary.svelte`                          |             4 |     4 |    0 | Narrow both captured match groups before interpolation.                                                       |
| `src/lib/features/create/shared/components/ConstructTabContent.svelte`                                   |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/create/shared/components/CreateModule.svelte`                                          |             4 |     2 |    2 | Evaluate mutable CreateModuleState inside derived callback; Snippets remain.                                  |
| `src/lib/features/create/shared/components/CreationToolPanelSlot.svelte`                                 |             2 |     0 |    2 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/create/shared/components/CreationWorkspaceArea.svelte`                                 |             2 |     0 |    2 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte`                               |             4 |     1 |    3 | Convert workspace-content truthiness to boolean; Snippets remain.                                             |
| `src/lib/features/create/shared/components/sequence-actions/DurationPatternView.svelte`                  |             2 |     2 |    0 | Duration palette is numeric; StripValue also includes strings.                                                |
| `src/lib/features/create/shared/components/sequence-actions/MobileHandSelector.svelte`                   |             1 |     1 |    0 | Contextualize default options as HandOption[].                                                                |
| `src/lib/features/create/shared/components/sequence-actions/PictographInspectModal.svelte`               |             1 |     1 |    0 | Annotate the mutable GridMode union.                                                                          |
| `src/lib/features/create/shared/components/sequence-actions/PropOrientationControl.svelte`               |             1 |     1 |    0 | Keep tone as blue/red literals.                                                                               |
| `src/lib/features/create/shared/components/sequence-actions/SequenceActionsPanel.svelte`                 |             1 |     1 |    0 | Await and discard rewind result at the void callback boundary.                                                |
| `src/lib/features/create/shared/components/sequence-actions/StepControlsZone.svelte`                     |             3 |     3 |    0 | Use string option IDs and resolve them to the existing numeric/float palette.                                 |
| `src/lib/features/create/shared/components/sequence-actions/StepEditorPanel.svelte`                      |             2 |     2 |    0 | Annotate placement locations with GridLocation.                                                               |
| `src/lib/features/create/shared/workspace-panel/components/WorkspacePlayback.svelte`                     |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/create/shared/workspace-panel/sequence-display/components/StepCell.svelte`             |             1 |     1 |    0 | Listen for animationcancel through a native DOM action with cleanup.                                          |
| `src/lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte`             |             3 |     3 |    0 | Capture the narrowed container before the closure; annotate slot callback.                                    |
| `src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte`            |             2 |     1 |    1 | Derive trigger argument type from WordActionMenu props; Snippet remains.                                      |
| `src/lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte`        |             1 |     1 |    0 | Read the render cell as PictographData; optional conjoined is render metadata.                                |
| `src/lib/features/create/shared/workspace-panel/shared/components/buttons/WorkspaceShareSheet.svelte`    |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/create/tunnel/components/TunnelLayout.svelte`                                          |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/create/tunnel/components/TunnelPerformerRoster.svelte`                                 |             2 |     2 |    0 | Infer non-null filtering instead of an invalid wider predicate.                                               |
| `src/lib/features/learn/components/interactive/letters/type1/Type1ConceptExperience.svelte`              |             6 |     6 |    0 | Tested question fallback; preserve literal letter type in non-null filtering.                                 |
| `src/lib/features/learn/components/interactive/motions/PlacementComparison.svelte`                       |             3 |     3 |    0 | Keep mutable grid state typed as GridMode.                                                                    |
| `src/lib/features/learn/components/interactive/placements/PlacementsConceptExperience.svelte`            |             1 |     1 |    0 | Convert built-placement truthiness to boolean.                                                                |
| `src/lib/features/learn/components/interactive/rotation/RotationDirectionConceptExperience.svelte`       |             5 |     5 |    0 | Tested question fallback; preserve literal letter type in non-null filtering.                                 |
| `src/lib/features/learn/components/interactive/words/LearningWordStage.svelte`                           |             3 |     0 |    3 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/learn/play/components/previews/PerformerStageLite.svelte`                              |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/learn/play/games/word-bridges/WordBridgeGame.svelte`                                   |             2 |     2 |    0 | Interpolate boolean answer values via String, preserving their text.                                          |
| `src/lib/features/learn/quiz/components/shared/QuizPerformerStage.svelte`                                |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/features/stage/components/FormationOverlay.svelte`                                              |             2 |     2 |    0 | Declare originX before its caption derived expression.                                                        |
| `src/lib/shared/3d/components/Grid3D.svelte`                                                             |             2 |     2 |    0 | Declare visiblePlaneList before joinedPlanes.                                                                 |
| `src/lib/shared/sequence-viewer/components/ArtPane.svelte`                                               |             2 |     2 |    0 | Preserve the viewer source literal without widening to string.                                                |
| `src/lib/shared/sequence-viewer/components/MandalaControlDock.svelte`                                    |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerContent.svelte`                           |             1 |     1 |    0 | Normalize absent onTunnelSaved from null to undefined.                                                        |
| `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte`                              |             2 |     0 |    2 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte`                                   |             8 |     2 |    6 | Capture narrowed sequence in the guarded template block; Snippets remain.                                     |
| `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte`                                |             2 |     2 |    0 | Root callback contract now permits null cleanup notifications.                                                |
| `src/lib/shared/sequence-viewer/components/ViewerHeader.svelte`                                          |             2 |     1 |    1 | Derive trigger argument type from WordActionMenu props; Snippet remains.                                      |
| `src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte`                                   |             2 |     0 |    2 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte`                                       |             5 |     3 |    2 | Default absent landscape flag to false; move axis derivation after panelLayout; Snippets remain.              |
| `src/lib/shared/sequence-viewer/components/ViewerWorkspacePanels.svelte`                                 |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/shared/sequence-viewer/components/step-mapping/StepMapEditor.svelte`                            |             5 |     5 |    0 | Use string rate IDs, converting the selected ID to its existing numeric rate.                                 |
| `src/lib/shared/sequence-viewer/components/step-mapping/StepMapTimeline.svelte`                          |             4 |     4 |    0 | Declare timelineWidth before its density derivation.                                                          |
| `src/lib/shared/sequence-viewer/tunnel/TunnelPictographStrip.svelte`                                     |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/shared/settings/components/tabs/PropTypeTab.svelte`                                             |             6 |     6 |    0 | Consume the required preset fields rather than optional AppSettings patch fields.                             |
| `src/lib/shared/settings/components/tabs/background/BackgroundTab.svelte`                                |             2 |     2 |    0 | Guard absent metadata before applying and default absent gradient text.                                       |
| `src/lib/shared/settings/components/tabs/preferences/LanguagePreference.svelte`                          |             1 |     1 |    0 | Use the locale code as a label fallback.                                                                      |
| `src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte`                                 |             3 |     1 |    2 | Normalize optional fan appearance; Snippets remain.                                                           |
| `src/lib/shared/settings/components/tabs/prop-type/PrimaryPropColorSettings.svelte`                      |             1 |     0 |    1 | Native Snippet seam already uses Svelte Snippet; no honest source correction established.                     |
| `src/lib/shared/settings/components/tabs/prop-type/PropChiralityRow.svelte`                              |             1 |     1 |    0 | Use semantic hand tones; custom palette still enters the existing CSS variables.                              |
| `src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte`                                      |             7 |     7 |    0 | Move detailProp earlier; type chirality callbacks; guard family-only base; optional normalized grip contract. |
| `src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte.test.ts`                              |            15 |    15 |    0 | 15 call-site diagnostics addressed by optional grip props in PropGrid, without editing tests.                 |
| `src/lib/shared/settings/components/tabs/prop-type/PropGridFamilyTile.svelte.test.ts`                    |             1 |     1 |    0 | Call-site diagnostic addressed by optional grip props in PropGrid, without editing test.                      |
| `src/lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte`                            |             2 |     2 |    0 | Pass title to DrawerHeader and BentoPropGrid; displayTitle was ignored.                                       |
| `src/lib/shared/shape-matrix/app/components/ShapeMatrixAppShell.svelte`                                  |             2 |     2 |    0 | Declare animationState before its focusMode derivation.                                                       |
| `src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte`                                         |             6 |     6 |    0 | Declare visibleStep before headerStepNumber.                                                                  |

## RUNTIME DEFECTS

- Observation: `PropSelectionSheet.svelte` passed a `displayTitle` prop to `DrawerHeader` and `BentoPropGrid`, whose contracts read `title`. The displayed title was therefore missing. Both callers now pass `title={displayTitle}`. The browser prop-sheet suite passed in the focused component run.
- Observation: both letter lessons indexed question tuples with mutable saved indexes and immediately read answer/letter/choices from the result. Inference: invalid saved progress could crash the lesson. `lesson-question.ts` returns the first real question when an index is negative, fractional, out of bounds, NaN or infinite; six focused assertions pass.
- Observation: StepCell already intended to settle its entrance on animationcancel, but Svelte's event attribute type rejects that attribute. A native DOM action now installs/removes the same listener. A new regression dispatches cancellation and checks that an animating cell becomes visible; eight StepCell assertions pass, including this one.
- Observation: `PropChiralityRow.svelte` supplied raw palette color strings to a control whose indicator CSS selects semantic blue/red tones. It now supplies the semantic hand tone while retaining both custom palette CSS variables and preview colors. Inference: the previous unmatched tone could omit the selected-color wash.
- Observation: listed initialization-order diagnostics were removed by moving the dependency ahead of its derived use: `originX`, `visiblePlaneList`, `detailProp`, `panelLayout`, `timelineWidth`, `animationState`, and `visibleStep`. Inference: this removes a risk if a derived value is evaluated early. Svelte derives lazily, so this report does **not** claim seven reproduced crashes. No algorithm or dependency expression changed.
- Observation: numeric turn/rate IDs were adapted to the existing string-valued SegmentedControl API and decoded back to the same values. These are type corrections; a numerical runtime failure was not established.

## ROOT CAUSES

- `PropGrid.svelte` normalizes an absent triangle grip already. Making grip props optional and guarding the optional callback aligns raw picker callers with that behavior and addresses 16 component-test call-site diagnostics. Wrapper BentoPropGrid still supplies its persisted grip and writer.
- `viewer-split-pane-types.ts` now accepts the null cleanup notification emitted by ArtPane, addressing both ViewerCompanionSurface callbacks. This models existing runtime notifications.
- The two literal-letter result filters incorrectly asserted a wider Letter type. Keeping the inferred letter union and filtering null pictographs removes both predicate errors.
- The two lessons share the same tested question lookup. Capability search terms: question, index fallback, nonempty. Closest owner is canonical-lesson-content.ts; no existing safe question-index helper was found. The pure lookup is colocated with its first consumer and reused by rotation.
- Mutable discriminants inferred as only their initial literal are explicitly annotated: GridMode and semantic orientation tones.
- `WorkspaceGrid.svelte` reads cells as `PictographData`, whose optional `conjoined` is render-only metadata. Stored StepData was not widened and canonical package types were not changed.
- Closure/control-flow diagnostics are resolved by capturing the narrowed scroll container or sequence before the callback/snippet, and by evaluating mutable module state inside `$derived.by`.

## LEFT

Observation: these 58 diagnostics were intentionally left. All other supplied rows have source corrections listed above, pending the coordinator's checker.

Snippet evidence: `src/lib/shared/components/DualSourceCrossfade.svelte:25-26` already uses `first: Snippet; second: Snippet`; `LazyMount.svelte:61-63` already uses `placeholder?: Snippet` and `error?: Snippet<[unknown, () => void]>`; `SegmentedControl.svelte` uses `optionContent?: Snippet<[T]>`; `WorkShelfRail.svelte` uses `content: Snippet<[WorkShelfId]>`; `gallery-workspace-types.ts` uses `GalleryValueHeadSnippet = Snippet<[title: string, hint?: string, trailing?: Snippet]>`. Callers supply native `{#snippet}` values. Inference: the reported return-marker incompatibility may involve generated typing/toolchain or module resolution. This was not established without the full diagnostic detail; casting, weakening the contracts, or changing snippet behavior would violate the fix policy.

- `src/lib/features/browse/collections/components/MyCollectionsPanel.svelte`
  - L908: Type '(shelfId: WorkShelfId) => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[WorkShelfId]>'.
- `src/lib/features/browse/collections/components/WorkShelfRail.svelte`
  - L116: Type '(shelfId: WorkShelfId) => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[WorkShelfId]>'.
- `src/lib/features/browse/gallery-home/FilterWorkspace.svelte`
  - L376: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/browse/gallery-home/GalleryWorkspace.svelte`
  - L110: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L118: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L128: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L138: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L146: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L157: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L165: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L173: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L181: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L191: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L199: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
  - L209: Type '(title: string, hint?: string, trailing?: Snippet) => ReturnType<import("svelte").Snippet>' is not assignable to type 'GalleryValueHeadSnippet'.
- `src/lib/features/browse/gallery-home/value-editors/GalleryFamilyEditor.svelte`
  - L54: No overload matches this call.
- `src/lib/features/browse/gallery-home/value-editors/GalleryLoopEditor.svelte`
  - L67: No overload matches this call.
- `src/lib/features/browse/shared/components/BrowseModule.svelte`
  - L712: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/create/construct/option-picker/swipe-layout/components/OptionViewerSwipeLayout.svelte`
  - L398: Type '(groupKey: LetterTypeGroupKey) => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[LetterTypeGroupKey]>'.
- `src/lib/features/create/generate/components/cards/LoopRhythmConfigurator.svelte`
  - L130: Type '(reflectionAxis: LoopRhythmValue["reflectionAxis"]) => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<["north-south" | "east-west" | "northeast-southwest" | "northwest-southeast"]>'.
- `src/lib/features/create/shared/components/ConstructTabContent.svelte`
  - L110: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/create/shared/components/CreateModule.svelte`
  - L1176: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L1177: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/create/shared/components/CreationToolPanelSlot.svelte`
  - L243: Type '(() => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol) | undefined' is not assignable to type 'Snippet<[]> | undefined'.
  - L244: Type '(\_error: unknown, retry: () => void) => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[unknown, () => void]>'.
- `src/lib/features/create/shared/components/CreationWorkspaceArea.svelte`
  - L274: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L275: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte`
  - L493: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L578: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L588: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/create/shared/workspace-panel/components/WorkspacePlayback.svelte`
  - L128: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte`
  - L435: Type '(actions: any) => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol' is not assignable to type 'Snippet<[WordActionTrigger]>'.
- `src/lib/features/create/shared/workspace-panel/shared/components/buttons/WorkspaceShareSheet.svelte`
  - L286: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/create/tunnel/components/TunnelLayout.svelte`
  - L329: Type '(dense: boolean) => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[boolean]>'.
- `src/lib/features/learn/components/interactive/words/LearningWordStage.svelte`
  - L154: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L161: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L168: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/features/learn/play/components/previews/PerformerStageLite.svelte`
  - L106: Type '{ id: string; readonly config: CharacterInstanceConfig; readonly position: { x: number; y: number; z: number; }; facingAngle: number; readonly isMoving: boolean; readonly moveDirection: { ...; }; ... 102 more ...; resetAllOverrides: () => void; }' is missing the following properties from type 'AvatarInstanceState': bluePropState, redPropState (ts)
- `src/lib/features/learn/quiz/components/shared/QuizPerformerStage.svelte`
  - L109: Type '{ id: string; readonly config: CharacterInstanceConfig; readonly position: { x: number; y: number; z: number; }; facingAngle: number; readonly isMoving: boolean; readonly moveDirection: { ...; }; ... 102 more ...; resetAllOverrides: () => void; }' is missing the following properties from type 'AvatarInstanceState': bluePropState, redPropState (ts)
- `src/lib/shared/sequence-viewer/components/MandalaControlDock.svelte`
  - L75: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte`
  - L492: Type '(() => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol) | undefined' is not assignable to type 'Snippet<[]> | undefined'.
  - L493: Type '((\_error: unknown, retry: () => void) => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol) | undefined' is not assignable to type 'Snippet<[unknown, () => void]> | undefined'.
- `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte`
  - L1336: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L1524: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L1525: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L1531: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L1532: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L1918: Type '(() => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol) | undefined' is not assignable to type 'Snippet<[]> | undefined'.
- `src/lib/shared/sequence-viewer/components/ViewerHeader.svelte`
  - L539: Type '(actions: any) => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol' is not assignable to type 'Snippet<[WordActionTrigger]>'.
- `src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte`
  - L564: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L565: Type '(\_error: unknown, retry: () => void) => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[unknown, () => void]>'.
- `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte`
  - L766: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
  - L773: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/shared/sequence-viewer/components/ViewerWorkspacePanels.svelte`
  - L146: Type '() => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[]>'.
- `src/lib/shared/sequence-viewer/tunnel/TunnelPictographStrip.svelte`
  - L122: Type '(cell: NotationCell) => ReturnType<import("svelte").Snippet>' is not assignable to type 'Snippet<[NotationCell]>'.
- `src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte`
  - L136: Type '(() => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol) | undefined' is not assignable to type 'Snippet<[]> | undefined'.
  - L139: Type '(() => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol) | undefined' is not assignable to type 'Snippet<[]> | undefined'.
- `src/lib/shared/settings/components/tabs/prop-type/PrimaryPropColorSettings.svelte`
  - L82: Type '((pair: { left: string; right: string; }) => { '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"; } & unique symbol) | undefined' is not assignable to type 'Snippet<[{ left: string; right: string; }]> | undefined'.

## PACKAGE PROPOSALS

- Observation: the error snapshot's external `@austencloud/scene-3d` AvatarInstanceState requires bluePropState/redPropState, while the app's `src/lib/shared/3d/state/character-instance-state.svelte.ts:1523-1527` exposes leftPropState/rightPropState. `Viewer3DScene.svelte:952` documents the package's remaining blue/red compatibility seam. Proposal: migrate AvatarInstanceState and PerformerRig prop-state reads together to leftPropState/rightPropState, or supply an explicit compatibility adapter exposing bluePropState = leftPropState and redPropState = rightPropState without snapshotting mutable getters. Apply this consistently across the scene boundary. No package or shared character-state changes were made; the two Learn preview diagnostics remain.
- Proposal: obtain complete nested Snippet diagnostics and investigate toolchain/type-resolution identity at the coordinator's full-check environment before changing any Snippet contract. No dependency changes proposed without that evidence.

## TESTS RUN

Observation: focused commands ran locally using the required configs. Temporary config adjustments were `cacheDir: tests/.cache/swarm-batch-1` or `...-components`, SvelteKit `outDir: tests/.cache/swarm-kit`, and browser API `host: 127.0.0.1, port: 5239`. Native/runner config loaders avoided bundled temporary config output through the shared node_modules junction. All test processes ended; port 5239 had no listener afterward.

Commands and result lines:

```powershell
npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache src/lib/features/learn/components/interactive/letters/type1/lesson-question.test.ts
# Test Files 1 passed (1); Tests 6 passed (6); exit 0

npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache tests/unit/learn/canonical-concept-lessons.test.ts tests/unit/create/step-cell-selection-focus.test.ts tests/unit/create/step-grid-arrival-state.test.ts tests/unit/sequence-viewer/step-map-editor-blank-start.test.ts tests/unit/sequence-viewer/viewer-panel-layout.test.ts
# Test Files 5 passed (5); Tests 42 passed (42); exit 0

npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 tests/unit/create/step-cell-selection-focus.test.ts src/lib/features/learn/components/interactive/letters/type1/lesson-question.test.ts
# Final run: Test Files 2 passed (2); Tests 14 passed (14); exit 0
# First regression attempt used the wrong "visible" class in its assertion: 1 failed, 13 passed. Corrected to the actual "invisible" class and reran.

$batchTests = @(Get-Content tests/.cache/swarm-unit-files.txt)
npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 $batchTests
# Test Files 3 failed | 24 passed (27); Tests 4 failed | 262 passed (266); exit 1

npx vitest run --config tests/config/vitest.config.ts --configLoader native --no-cache --maxWorkers 2 tests/unit/sequence-viewer/viewer-transition-orchestration-contract.test.ts tests/unit/sequence-viewer-shell-contract.test.ts
# After restoring an accidentally changed existing header fallback and LF line endings: Test Files 2 passed (2); Tests 56 passed (56); exit 0
```

Expanded `$batchTests` arguments, in execution order:

- `tests/unit/worker-renderer/worker-grid-parity-contract.test.ts`
- `tests/unit/viewer-orchestrator-decomposition-contract.test.ts`
- `tests/unit/stage/stage-keyboard-contract.test.ts`
- `tests/unit/create-workspace-grid-layout.test.ts`
- `tests/unit/create-startup-import-boundary.test.ts`
- `tests/unit/create-mandala-viewer-contract.test.ts`
- `tests/unit/browse/browse-primary-sync-contract.test.ts`
- `tests/unit/fuse/fuse-actions-contract.test.ts`
- `tests/unit/grid-join/join-slide.test.ts`
- `tests/unit/create/create-front-door-source-contract.test.ts`
- `tests/unit/mandala-path-interpolator.test.ts`
- `tests/unit/create/sequence-actions-panel-decomposition-contract.test.ts`
- `tests/unit/create/step-wave-band.test.ts`
- `tests/unit/create/step-editor-playback-selection.test.ts`
- `tests/unit/public-collection-live-choreo-contract.test.ts`
- `tests/unit/learn/canonical-concept-lessons.test.ts`
- `tests/unit/prop-chirality-picker-contract.test.ts`
- `tests/unit/prop-color-picker-contract.test.ts`
- `tests/unit/sequence-viewer-shell-contract.test.ts`
- `tests/unit/shape-matrix/shape-engine-identity.test.ts`
- `tests/unit/shape-matrix/shape-matrix-mandala-continuity-contract.test.ts`
- `tests/unit/shape-matrix/shape-matrix-app-boundary.test.ts`
- `tests/unit/scan-cloud-render-contract.test.ts`
- `tests/unit/scene-prop-picker-contract.test.ts`
- `tests/unit/settings/language-tab-regional-locale.test.ts`
- `tests/unit/sequence-viewer/step-map-editor-blank-start.test.ts`
- `tests/unit/sequence-viewer/viewer-transition-orchestration-contract.test.ts`

Observation: the one remaining unit failure is `prop-chirality-picker-contract.test.ts > create step editor sheet passes a chirality seam`. Its assertion tests the unmodified `StepEditorCoordinator.svelte`. The exact regex `chirality(=\{|Seam\(|\})|propChirality=\{` also returns false against `git show 46285ef0cc50a1028f589f4af3f12ffe5755cc9c:src/lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte`, establishing that source-contract mismatch exists at the base. No out-of-scope coordinator fix was made.

```powershell
npx vitest run --config tests/config/vitest.components.config.ts --configLoader runner --no-cache --maxWorkers 1 src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte.test.ts src/lib/shared/settings/components/tabs/prop-type/PropGridFamilyTile.svelte.test.ts src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte.test.ts src/lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte.test.ts src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte.test.ts src/lib/features/create/construct/option-picker/swipe-layout/components/OptionViewerSwipeLayout.svelte.test.ts src/lib/features/create/construct/option-picker/components/OptionPickerContent.desktop-layout.svelte.test.ts src/lib/features/create/construct/option-picker/components/OptionPickerContent.settling-width.svelte.test.ts src/lib/features/create/construct/option-picker/components/DoubleFloatOptionRows.svelte.test.ts src/lib/features/create/shared/components/sequence-actions/PropOrientationControl.svelte.test.ts src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte.test.ts 'src/routes/(public)/composer/_sections/__tests__/ConstructSection.svelte.test.ts'
# Test Files 1 failed | 11 passed (12); Tests 1 failed | 83 passed (84); exit 1
```

Observation: failure is `OptionPickerContent.desktop-layout.svelte.test.ts:63`, `keeps the mobile letter-type controls aligned without an action prompt`: expected 56 <= 48. The edited desktop harness changed only a callback parameter annotation; no layout code changed. Inference: the failure is likely unrelated to this type correction; baseline reproduction was not performed. The browser reported repeated `Prop preview artwork: 404` warnings. No asset/layout changes were made outside the brief.

Earlier browser attempts: native loader failed to resolve extensionless `tests/helpers/browser-commands/real-touch`; runner loader then hit `listen EACCES: permission denied ::1:63315`. The IPv4 API configuration allowed all 12 component suites to execute.

```powershell
$batchPaths = @(git -c core.safecrlf=false diff --name-only -- src tests/unit/create)
$batchPaths += 'src/lib/features/learn/components/interactive/letters/type1/lesson-question.ts', 'src/lib/features/learn/components/interactive/letters/type1/lesson-question.test.ts'
npx eslint $batchPaths
# Final run: 46 problems (0 errors, 46 warnings); eslint exit: 0
npx prettier --check $batchPaths
# All matched files use Prettier code style!; exit 0
```

Observation: `eslint.config.js:18` globally ignores all `.svelte` files, and the tests directory is ignored too. ESLint success verifies the applicable TypeScript files only; ignored-file warnings were not suppressed. Prettier checked every authored code/test path. After the final WorkspaceGrid render-cell annotation, its individual Prettier check also passed.

```powershell
node --input-type=module -e "import {execFileSync} from 'node:child_process'; import {compileSvelteFiles} from './scripts/svelte-compile-gate.mjs'; const files=execFileSync('git',['diff','--name-only','--','src'],{encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('.svelte')); const results=await compileSvelteFiles(files); const failures=results.filter(r=>r.errors.length); for(const r of failures) console.log(r.file,JSON.stringify(r.errors)); console.log('Svelte compile:',results.length,'files;',failures.length,'failures'); process.exitCode=failures.length?1:0;"
# Svelte compile: 44 files; 0 failures; exit 0
# This compiles components in memory; it does not run the build or type checker.
git diff --check
# No whitespace errors; exit 0
```

## DEVIATIONS AND COORDINATOR FOLLOW-UP

- Observation: browser Vitest automatically created an ignored PNG outside the owned file extensions: `src/lib/features/create/construct/option-picker/components/__screenshots__/OptionPickerContent.desktop-layout.svelte.test.ts/OptionPickerContent-desktop-layout-keeps-the-mobile-letter-type-controls-aligned-without-an-action-prompt-1.png` (creation/write time 2026-10-14 17:00:50). This was an unintended generated-file scope deviation. It was never staged and was left in place, since moving/deleting outside owned paths would compound the deviation. Future browser runs should disable automatic failure screenshots or direct them under tests/ before starting.
- Observation: temporary test-config changes were needed to confine caches and avoid a denied port; they were removed before commits. Ignored test caches/logs remain solely under owned tests/.cache/.
- Observation: source-list counts and base SHA differ from the brief; table counts follow the actual input. No extra errors or dates were invented.
- Proposal: coordinator runs the full type check on these commits, provides nested details for remaining Snippet errors, and decides whether the two external scene-contract diagnostics should be handled by a package migration or a compatibility adapter. No Austen product decision or approval is needed for these next diagnostics.

## IMPLEMENTATION COMMITS

```text
9fe687a96192fa5e75429815c9d946e4b926481c fix(types): initialize derived dependencies before use (12 errors)
c623ec5d52ba93a9c629c718f04812e40361fb18 fix(types): settings batch 1 (36 errors addressed)
24da7a0902d6a520c28d536f1bd8c3a64ecf3526 fix(types): sequence-viewer batch 1 (20 errors addressed)
97ea4d6f3a4525b7450b4ae664519e6d6aa27d7f fix(types): learn batch 1 (17 errors addressed)
f4ec64de66a8bdc642b8ea08c8346f6f5ca86875 fix(types): create batch 1 (30 errors addressed)
bc5597bdb28b254345ff6760bfeeff3d4c123329 fix(types): browse batch 1 (7 errors addressed)
```
