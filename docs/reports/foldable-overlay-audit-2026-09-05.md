# Foldable navigation and overlay audit

Date: 2026-09-05. Surface: Flow Arts Composer navigation from `/settings/profile`.

## Findings fixed

| Finding                                                    | Cause                                                                                                                                                         | Change and evidence                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unfolded navigation clips module tiles behind its footer   | At 700px the sheet switched to `height: auto`; its absolute Crossfade layers supplied no intrinsic content height, so the sheet fell back to its 50dvh floor. | Keep a definite 85dvh height at this breakpoint. At 768×884, the sheet grew from 442px to 751px and the module scroller from 178px to 487px.                                                                                                                                                                    |
| Some tablet tiles ignore compact sizing                    | Count-specific and later tall-screen rules outranked the compact tablet rules.                                                                                | Apply compact overrides after those rules with matching specificity. At 820×1180 all tested count variants used approximately 72–76px tiles.                                                                                                                                                                    |
| A narrow landscape drawer adopts a wide-screen grid        | Module grid columns followed viewport width instead of the drawer's available width.                                                                          | Container queries now select columns inside the navigation scroller. Verified a 280px side drawer at 960×412.                                                                                                                                                                                                   |
| Five-module layouts overlap or produce a skinny final tile | Negative margins and oversized widths overlapped the second row; centering without a definite width let the final tile shrink to its text.                    | Use six tracks with equal two-track tiles and centered lower-row positions. At 600×800 all five tiles measured 176px wide.                                                                                                                                                                                      |
| Large-text footer labels collide                           | Five fixed flex columns could shrink below label width.                                                                                                       | Auto-fit grid tracks grow with rem-based text sizing; labels can wrap. At 375×667 with a 200% root font size, the five-action fixture used three columns, each approximately 105px, with no label overflow and 148px remaining for the module scroller. At normal text size all five actions remain on one row. |
| Side drawers block vertical touch scrolling                | `touch-action: pan-x` disallowed vertical panning. The gesture handler also prevented default on small horizontal drift during a vertical scroll.             | Allow vertical panning and hand predominantly vertical gestures back to the browser before processing horizontal dismissal. Added left/right diagonal-scroll regression cases. Existing intentional-dismiss and tap-slop tests still pass.                                                                      |
| Navigation side handle consumes narrow content width       | Navigation explicitly enabled the bottom-sheet handle for every placement, triggering a side-handle gutter.                                                   | Show the handle only for bottom placement.                                                                                                                                                                                                                                                                      |
| Inbox content extends below short landscapes               | An unconditional 400px minimum exceeded the space inside a short sheet.                                                                                       | Allow the flex container to shrink. At 960×320, restoring the old minimum put its bottom at 423px; the fix puts it at 320px, with a 220px content scroller.                                                                                                                                                     |

## Browser verification

Chrome DevTools MCP, task-owned local server on port 5194. Measurements were taken after opening/placement transitions settled; transient offscreen animation coordinates are not treated as final layout results.

| CSS viewport | Directly inspected                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| 375×667      | Navigation, scroll-to-last-item, five-action footer, normal and 200% root-font stress                |
| 960×412      | Left navigation, compact footer, narrow grid                                                         |
| 820×1180     | Bottom navigation, module-count variants including 20 items                                          |
| 1440×900     | Shared drawer through the real inbox; 480px-wide side drawer                                         |
| 1920×1080    | Inbox; approximately 538px-wide side drawer                                                          |
| 2560×1440    | Inbox; approximately 717px-wide side drawer                                                          |
| 3840×2160    | Inbox; 1024px-wide side drawer                                                                       |
| 768×884      | Original bug reproduction, corrected navigation, real Create destinations and Back transition        |
| 600×800      | Five-module layout, including all five equal widths                                                  |
| 960×320      | Inbox minimum-height reproduction and correction                                                     |
| 384×442      | Half-size Fold viewport reflow equivalent to 200% zoom; menu remains scrollable and footer reachable |

Navigation uses the desktop sidebar at desktop tiers, so the shared drawer was exercised there through Inbox rather than forcing an unavailable navigation sheet. Module-count checks used the real ModuleList component with local fixtures for 3, 4, 5, 6, 8, and 20 definitions. Five-action checks cloned local footer controls without authenticating or changing account records. These fixtures exercise geometry, not account permissions or inbox delivery.

The real navigation transition from Modules to Create's three available destinations and back preserved a 487px scrolling region. Narrow-screen checks confirmed that the final module can scroll above the footer. Screenshots were directly inspected during the session.

Focused tests: 13 passed across `drawer-swipe-tap-slop`, `swipe-to-dismiss-safari`, and `full-bleed-drawer-contract`. The two new cases ensure diagonal vertical scrolling is not canceled or later converted into side dismissal. Existing tests cover taps and deliberate swipes. The shared gesture owner was extended; no parallel gesture implementation was introduced.

## Audit scope and remaining risks

The source survey inventoried 56 files containing direct Drawer uses and 33 files containing fill-mode Crossfade uses, including existing test surfaces. It examined viewport bounds, percentage heights, flex shrinkability, overflow ownership, count-specific grid rules, and touch-action restrictions. Drawer, Crossfade, BaseModal and its sizing tokens were reviewed as shared owners. The complete source inventory follows below.

Existing protections were found in SequenceDrawer (definite mobile height), PropSelectionSheet (height after safe-area inset), CollectionGalleryDetail (height bounded by its actual containing block), ShareSheetFrame and BaseModal (viewport caps), and AddSequencesSheet/ScanCardSheet (bounded scroll regions). Their source patterns do not exhibit the particular navigation auto-height/absolute-layer conflict. This is a source assessment, not proof of every feature state.

Source-only follow-up candidates:

- `AdminTwoPanelLayout.svelte` sets `--sheet-height: 85vh`, which the Drawer stylesheet does not consume. Its apparent height therefore comes from defaults/content. The authenticated admin detail states were not available for a runtime reproduction; verify intended sizing before changing that owner.
- Collaboration invitation/upload sheets, training pickers, and some gallery/sheet-browser overlays retain `vh` limits or `!important` sizing overrides. Those deserve browser-chrome and keyboard checks on their real feature routes. A `vh` occurrence by itself is not a proven defect, so these were not mechanically rewritten.
- Deep editor, account-only, and 3D states in the inventory were surveyed in source, not exhaustively exercised with live data. Native Samsung keyboard/safe-area behavior and physical touch scrolling still need device coverage. CSS reflow and enlarged-text checks are not a physical Z Fold run or a native browser-zoom measurement. Reduced-motion rules were preserved; a dedicated OS reduced-motion run was not performed.

The screenshot identifies a viewport class, not its exact CSS dimensions or device model. The Fold-sized emulation reproduces the same failure mechanism without assuming a specific Z Fold generation.

## Source inventory

### Drawer consumers

- `src/routes/test/flow-fest-sim/FlowFestUtilityDrawer.svelte`
- `src/lib/shared/video-collaboration/components/InviteCollaboratorsPanel.svelte`
- `src/lib/shared/video-collaboration/components/InviteCollaboratorsSheet.svelte`
- `src/lib/shared/video-collaboration/components/VideoUploadSheet.svelte`
- `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte`
- `src/lib/shared/sequence-viewer/components/SequenceDrawer.svelte`
- `src/lib/shared/share/components/ShareActionMenu.drawer-regression.test-harness.svelte`
- `src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.drawer-regression.test-harness.svelte`
- `src/lib/shared/settings/components/ProfilePhotoPicker.svelte`
- `src/lib/shared/share/components/ShareSheetFrame.svelte`
- `src/lib/shared/share/components/ShareActionMenu.svelte`
- `src/lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte`
- `src/lib/shared/settings/components/tabs/release-notes/VersionDetailContent.svelte`
- `src/lib/shared/settings/components/tabs/release-notes/VersionDetailPanel.svelte`
- `src/lib/features/sticker-lab/StickerLab.svelte`
- `src/lib/shared/navigation/components/ModuleSwitcher.svelte`
- `src/lib/shared/navigation/components/AuthSheet.svelte`
- `src/lib/shared/modules/CollectionGalleryDetail.svelte`
- `src/lib/features/write/components/sheet/SheetBrowserDrawer.svelte`
- `src/lib/features/write/components/sheet/ChoreoSheetView.svelte`
- `src/lib/features/train/components/SequenceBrowser.svelte`
- `src/lib/features/train/components/practice/GridSettingsSheet.svelte`
- `src/lib/features/train/components/practice/ModePickerSheet.svelte`
- `src/lib/features/train/components/practice/ModeSettingsSheet.svelte`
- `src/lib/features/toys/tabs/third-order/ThirdOrderToy.svelte`
- `src/lib/shared/inbox/components/InboxDrawer.svelte`
- `src/lib/shared/inbox/components/messages/MessageActionSheet.svelte`
- `src/lib/features/store/components/CartDrawer.svelte`
- `src/lib/features/fuse/components/FuseDetailDrawer.svelte`
- `src/lib/features/skewlab/components/SkewLabEditorPanel.svelte`
- `src/lib/features/library/components/collection-picker/CollectionPickerSheet.svelte`
- `src/lib/shared/components/touch/VirtualKeyboard.svelte`
- `src/lib/features/create/shared/components/CreatePanelDrawer.svelte`
- `src/lib/features/create/shared/components/SaveToLibraryDialog.svelte`
- `src/lib/features/create/shared/components/TransferConfirmDialog.svelte`
- `src/lib/features/create/shared/components/dialogs/SavePromptDialog.svelte`
- `src/lib/features/create/generate/components/modals/GenerationSettingsDrawer.svelte`
- `src/lib/features/create/generate/components/modals/LOOPDrawer.svelte`
- `src/lib/features/create/generate/components/presets/PresetDrawer.svelte`
- `src/lib/features/feedback/components/manage/FeedbackArchiveView.svelte`
- `src/lib/features/feedback/components/quick/QuickFeedbackPanel.svelte`
- `src/lib/features/feedback/components/my-feedback/MyFeedbackDetail.svelte`
- `src/lib/features/feedback/components/manage/FilterDesktopDrawers.svelte`
- `src/lib/features/feedback/components/my-feedback/FeedbackEditDrawer.svelte`
- `src/lib/features/compose/timeline/components/SnapControls.svelte`
- `src/lib/features/compose/components/controls/AnimationSettingsSheet.svelte`
- `src/lib/features/compose/components/controls/TrailSettingsSheet.svelte`
- `src/lib/features/compose/tabs/browse/components/CompositionViewerDrawer.svelte`
- `src/lib/features/browse/gallery-home/GalleryFilterSheet.svelte`
- `src/lib/features/browse/shared/components/GalleryTab.svelte`
- `src/lib/features/browse/collections/components/AddSequencesSheet.svelte`
- `src/lib/features/browse/collections/components/AllLibraryView.svelte`
- `src/lib/features/browse/collections/components/ScanCardSheet.svelte`
- `src/lib/features/assemble-lab/components/OrientationExplainer.svelte`
- `src/lib/shared/admin/components/AdminTwoPanelLayout.svelte`
- `src/lib/shared/animation-engine/components/AnimationViewerHelpSheet.svelte`

### Fill-mode Crossfade consumers

- `src/routes/(public)/guide/level-1/_components/GuideGridExplorer.svelte`
- `src/routes/test/onboarding-first-visit/FirstVisitAppFrame.svelte`
- `src/routes/test/notation-vtg-options/_components/VtgFigureCycle.svelte`
- `src/routes/test/crossfade/+page.svelte`
- `src/routes/endless-spinner/+page.svelte`
- `src/lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte`
- `src/lib/shared/loop-explorer/components/ExplorerShowcase.svelte`
- `src/lib/shared/navigation/components/ModuleSwitcher.svelte`
- `src/lib/shared/modules/CollectionGalleryDetail.svelte`
- `src/lib/shared/mandala/components/MandalaLoader.svelte`
- `src/lib/features/write/components/sheet/ActsDock.svelte`
- `src/lib/shared/landing/components/launchpad/GlossaryDictionaryCard.svelte`
- `src/lib/shared/landing/components/launchpad/PictographFadeCard.svelte`
- `src/lib/features/store/StarterPackPage.svelte`
- `src/lib/features/store/LoopDeckConfiguratorPage.svelte`
- `src/lib/features/store/DeckArchitectPage.svelte`
- `src/lib/features/stage/components/StageTimeline.svelte`
- `src/lib/features/learn/play/components/GameShell.svelte`
- `src/lib/features/learn/components/interactive/motions/MotionsConceptExperience.svelte`
- `src/lib/shared/components/RailPropGlyph.svelte`
- `src/lib/features/create/tunnel/components/TunnelPerformerCard.svelte`
- `src/lib/features/create/shared/tool-panel/core/ToolPanel.svelte`
- `src/lib/features/create/construct/option-picker/swipe-layout/components/OptionViewerSwipeLayout.svelte`
- `src/lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte`
- `src/lib/features/create/shared/components/ConstructTabContent.svelte`
- `src/lib/features/creators/components/CreatorsPanel.svelte`
- `src/lib/features/create/construct/start-placement-picker/components/StartPlacementPicker.svelte`
- `src/lib/shared/attract/components/ThoughtCaption.svelte`
- `src/lib/features/browse/gallery-home/GalleryDrill.svelte`
- `src/lib/features/choreo-card/components/deck-releaser/GalleryComposeBoard.svelte`
- `src/lib/features/browse/shared/components/BrowseModule.svelte`
- `src/lib/shared/3d/components/controls/PropBuildPicker.svelte`
- `src/lib/shared/3d/components/onboarding/Scene3DSetupGuide.svelte`
