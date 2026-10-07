---
status: active
value: 3
effort: L
remaining: "Verify God File Decomposition against the current God File Decomposition runtime and acceptance criteria before resuming implementation. Prior recorded remainder: 'Says \"Draft\"; real decomposition landed unevenly. ChoreoCard 2090→287. Museum3DScene 1770→1374 (target 600). Orchestrator + library-repository untouched'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# God File Decomposition

**Queue evidence (2026-10-07):** Partial decomposition landed; the old Draft label no longer describes current code. See frontmatter for the remaining work.

> **DRIFT WARNING — 2026-08-02.** Says "Draft"; real decomposition landed unevenly. ChoreoCard 2090→287. Museum3DScene 1770→1374 (target 600). Orchestrator + library-repository untouched
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-05-04
**Original status (historical):** Draft
**Type:** Structural refactoring — zero behavior changes

## Problem

47 source files exceed 1,000 lines. Audit of all 47 revealed:

- 6 need no changes (data files, test pages, CSS-heavy with lean logic)
- 13 are large but earn their size (single responsibility, CSS bulk, or already well-factored)
- 28 need actual decomposition

The original estimate of 47 was wrong. Line count alone is misleading — many Svelte files are 50-60% CSS with tiny script sections.

## Approach

Four phases, each independently shippable. No behavior changes. Every phase passes `npm run check` + `npm run build` before merging.

## Excluded Files (19 total)

### SKIP (6 files) — Don't touch

| File | Lines | Reason |
|---|---|---|
| retro-icons.ts | 1,292 | Pure data — 57 icon SVG definitions with 3 shared helpers |
| thumbnail-benchmark/+page.svelte | 1,274 | Test page — developer diagnostics, no production consumers |
| render-compare/+page.svelte | 1,218 | Test page — same reasoning |
| museum-room-graph.ts | 1,125 | Pure data — 16 room definitions + 15 edges + grid config |
| InlineQuiz.svelte | 1,022 | 61% CSS (627 lines), script only 153 lines |
| MyFeedbackDetail.svelte | 1,003 | 56% CSS (567 lines), script only 169 lines, state already extracted |

### FINE (13 files) — Large but earn their size

| File | Lines | Reason |
|---|---|---|
| WebGLFireRenderer.ts | 1,530 | Fluid simulation is inherently monolithic. 13-step Navier-Stokes pipeline. Optional bloom extraction only. |
| ShaderLibrary.ts | 1,249 | 1,165 lines are GLSL source strings (data), class is 83 lines |
| WebGPUFireExecutor.ts | 1,192 | Single GPU executor with inline WGSL. Follows sibling executor pattern. |
| TikaReviewPanel.svelte | 1,187 | 53% CSS (630 lines), script 240 lines, logic already decomposed to repository/formatter |
| ModuleQuickToggle.svelte | 1,178 | 57% CSS (677 lines), script 296 lines, services already extracted |
| ProfileAdminSection.svelte | 1,114 | 38% CSS (420 lines), 12 $state, already isolated admin panel |
| AsciiRenderer.ts | 1,108 | Stateless renderer implementing IAsciiRenderer. Cohesive rendering pipeline. |
| VideoPanel.svelte | 1,087 | 47% CSS (514 lines), 571 lines of logic for legitimate multi-state panel |
| WebGPUOverlayEffectsExecutor.ts | 1,074 | GPU executor with inline WGSL. 7 effect execute methods sharing GPU resources. |
| arrange-grid-state.svelte.ts | 1,035 | Well-factored orchestrator. 8 services already extracted. Remaining code is API surface needing $state access. |
| panel-coordination-state.svelte.ts | 1,027 | Panel mutex coordinator. 37 $state variables must co-locate for closeAllPanels() atomicity. |
| AdminToolbarDesktop.svelte | 1,025 | Script only 197 lines. Rest is template (338) + CSS (490) for visually complex responsive toolbar. |
| MuseumGeometryBuilder.ts | 1,010 | Delete ~160 lines of commented-out dead code. Remainder is coherent geometry pipeline at ~850 lines. |

## Phase 1: Dedup Refactors

**Scope:** 3 files, ~1,400 lines collapsed, zero new files created.

Highest ROI. Pure code quality. The effect dispatch system has accumulated massive structural duplication across three tightly coupled files. All three share the same pattern: iterate effects, check config, filter tips, call renderer, catch error, increment counter, auto-disable on threshold. Collapsing this into a data-driven registry eliminates the duplication without changing any runtime behavior.

### AnimationRenderLoop.ts (2,252 → ~1,200 lines)

**Problem:** 14 effect dispatch blocks (lines ~966-1932) are structurally identical: check config → filter tips → call renderer → catch error → increment counter → auto-disable. ~1,000 lines of mechanical boilerplate.

**Solution:** Replace with data-driven loop over effect registry. Each effect entry:

```ts
{ name, renderer, configGetter, tipInputConstructor, disabledFlag, errorCount }
```

Generic dispatch method iterates registry.

**Also extract:**

- `OverlaySuppressor` (~60 lines) — move to EffectRendererManager where it logically belongs
- `FrameDropDiagnostics` (~120 lines) — standalone class, no coupling to render loop internals

**Estimated reduction:** 2,252 → ~1,200 lines.

### EffectRendererManager.ts (1,015 → ~600 lines)

**Problem:** 15 nearly-identical `syncXOverlay()` methods (init/destroy lifecycle per effect). ~400 lines of copy-paste.

**Solution:** Registry-driven generic `syncOverlay(effectType)` method. Each effect gets a registry entry:

```ts
{ renderer, rendererKey, prevFlag }
```

**Also absorb:** OverlaySuppressor from AnimationRenderLoop.

**Estimated reduction:** 1,015 → ~600 lines.

### AnimationEngine.svelte.ts (1,626 → ~1,300 lines)

**Problem:** `handleVisibilityChange` method (lines 1186-1454, ~270 lines) has 14 repetitive effect-toggle-sync blocks.

**Solution:** Data-driven loop matching the pattern established in Phase 1 refactors above. The EffectRendererManager could expose a `syncAllFromVisibilityManager(vm)` method.

**Also extract:** Fire slider sync + path shape change handling (~100 lines) as a method on EffectRendererManager.

**Estimated reduction:** 1,626 → ~1,300 lines.

## Phase 2: Big Five State Extractions

**Scope:** 5 Svelte god files. Extract reactive logic into `state/*.svelte.ts` modules using `createFooState(deps)` factory pattern and into plain `.ts` service modules. Kebab-case throughout.

### ChoreoCard.svelte (2,090 → ~800 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `state/choreo-card-layout-state.svelte.ts` | ~200 | Column/row/aspect-ratio/header-footer sizing derivations. Input: sequence, options. Output: effectiveColumns, effectiveRows, previewAspectRatio, scaled sizes. |
| `services/choreo-card-cell-pipeline.ts` | ~350 | renderAllCells, relayoutCells, detectMixedDurations, calculateGridPosition, buildRenderOptions, global preview cache. |
| `services/choreo-card-context-menu.ts` | ~80 | Context menu item construction (copy, share, etc.) as a builder function. |
| `state/dark-mode-crossfader-state.svelte.ts` | ~100 | Crossfade state machine (crossfadeActive, timer, activeDarkMode, key diffing). |

ChoreoCard.svelte becomes thin shell: props, composable wiring, template (~300 lines), CSS (~200 lines).

### Museum3DScene.svelte (1,770 → ~600 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `services/museum-camera-flip-controller.ts` | ~180 | TOP_DOWN/FPS state, flip animation, easeInOutCubic, syncFps methods. Returns update(delta) and camera target. |
| `services/museum-geometry-streamer.ts` | ~300 | Web worker lifecycle, requestRoomBuild, activateRoom, distance computation, initial load orchestration. |
| `services/museum-proximity-renderer.ts` | ~150 | 7 proximity grids, recomputeVisibility, pending mount queue, mount/unmount. |
| `services/museum-player-controller.ts` | ~200 | Top-down movement, FPS position sync, portal teleport, void recovery, spawn reset, facing direction. |

Museum3DScene.svelte retains: template (~370 lines), effects, props interface.

### SequenceViewerOrchestrator.svelte (1,324 → ~1,000 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `state/library-action-handler.svelte.ts` | ~120 | handleSave, handleDelete, handlePublish, handleUnpublish, handleFavoriteToggle, isSaved/isFavorite state. |
| `state/fullscreen-controller.svelte.ts` | ~50 | enterFullscreen, exitFullscreen, handleFullscreenTap, controlsHideTimeout. |
| `services/editing-pane-persistence.ts` | ~50 | loadRecentEditingPane, persistEditingPane, sessionStorage TTL. |

### CompositionLab.svelte (1,176 → ~875 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `state/composition-lab-state.svelte.ts` | ~300 | Cell state (cells array, selectedCellIds, undo/redo stack), all cell mutation handlers (add, delete, duplicate, update position/size/label/color/zIndex/mediaType), multi-select, undo/redo, keyboard shortcut handler. |

### SaveToLibraryPanel.svelte (1,164 → ~914 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `state/save-panel-state.svelte.ts` | ~250 | All 15 $state variables, 23 $derived computations, 9 $effect blocks. Single reactive state object. |

## Phase 3: Service Extractions

**Scope:** 8 TS files. Extract method groups into separate kebab-case `.ts` modules organized by concern.

### LibraryRepository.ts (1,533 → ~900 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `services/library-recycle-bin.ts` | ~200 | softDeleteSequence, restoreSequence, purgeSequence, emptyRecycleBin, getDeletedSequences. |
| `services/library-batch-operations.ts` | ~250 | deleteSequences, addTagsToSequences, setVisibilityBatch, moveToCollection. |

### ConversationManager.ts (1,239 → ~600 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `services/group-conversation-manager.ts` | ~465 | createGroup, getOrCreateGroup, addGroupMember, removeGroupMember, leaveGroup, updateGroupMetadata, setAdminStatus. |
| `services/conversation-mappers.ts` | ~170 | mapDocToConversation, mapDocToPreview, refreshParticipantInfo. Pure functions. |

### Canvas2DDirectRenderer.ts (1,483 → ~770 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `services/canvas-2d-glyph-renderer.ts` | ~530 | drawTKAGlyphText, drawTurnText, drawDirectionDot, VTG/elemental/position/reversal glyph rendering. |
| `services/canvas-2d-transform-helper.ts` | ~180 | wrapSvgContent, shouldMirrorProp, drawElementWithTransform, drawDash. |

### ImageComposer.ts (1,234 → ~920 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| Merge into existing `ImageFormatConverter.ts` | ~80 | svgStringToImage, canvasToImage, svgToImage, blobToImage, imageToBlob. |
| `services/cell-border-renderer.ts` | ~135 | drawSmartCellBorders, getOccupiedCells, findEmptyCellForQR. |
| `services/card-composer.ts` | ~103 | composeCardImage and header/footer calculations. |

### VideoExportOrchestrator.ts (1,075 → ~875 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `services/export-frame-compositor.ts` | ~200 | Per-frame overlay rendering: glyph crossfade, step numbers, word header, progress bar. |

### PostHogFeatureFlagService.svelte.ts (1,067 → ~800 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `services/posthog-flag-admin-service.ts` | ~120 | Server-side flag CRUD (updatePostHogFlag, rollback). Admin-only. |
| `domain/default-feature-flags.ts` | ~100 | _DEFAULT_FEATURE_FLAGS array, premium capability flag generation. |

Delete deprecated stubs (~30 lines): fetchUserData, subscribeToUserOverrides, subscribeToGlobalFlags.

### authState.svelte.ts (1,042 → ~700 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `services/profile-field-updater.ts` | ~170 | updateDisplayName, updateUsername, updateInstagramUsername, updatePronouns. Pure Firestore writes. |
| `services/auth-boot-orchestrator.ts` | ~130 | Child service initialization cascade from auth listener callback. |

### collision-lab-state.svelte.ts (1,024 → ~850 lines)

| Extracted module | Lines | Contents |
|---|---|---|
| `services/pose-target-mapper.ts` | ~80 | handToPropTarget, poseToOptimizerInput, OPTIMIZER_BOUNDS, POSITION_TO_GRID. Pure geometry. |
| `services/collision-lab-diagnostic.ts` | ~90 | buildDiagnosticReport, vec3ToPlain. Takes state as input, produces JSON. |

## Phase 4: Remaining Splits

**Scope:** 12 files — rendering infra (4), component splits (3), state extractions (5).

### Rendering infra (4 files)

**WebGPUBackend.ts (1,126 → ~790 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `services/webgpu-trail-executor.ts` | ~200 | executeTrailPass and 5 sub-passes, matching sibling executor pattern. |
| `services/webgpu-backend-shaders.ts` | ~140 | 6 WGSL shader string constants. |

**terrain-compute-generator.ts (1,136 → ~636 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `generation/terrain-cpu-generator.ts` | ~350 | CPU fallback path (generateChunkCPU, cpuFBM, normals, biome coloring, erosion). |
| `generation/terrain-mesh-builder.ts` | ~150 | addSkirtGeometry, generateIndices. Pure geometry utilities. |

**chunk-generator.worker.ts (1,125 → ~855 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `workers/chunk-worker-messages.ts` | ~120 | All message interfaces/union types shared across worker boundary. |
| `generation/skirt-geometry.ts` | ~100 | Skirt vertex/index generation. |

Move biome color helpers into `generation/biome-system.ts` (~50 lines).

**chunk-manager.ts (1,226 → ~726 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `core/chunk-zone-manager.ts` | ~390 | Real terrain zone, stage zone, spawn clearing management. |
| `core/chunk-types.ts` | ~110 | ChunkEntity, ChunkManagerConfig, ChunkState, ChunkMeshData, ChunkKey. |

### Component splits (3 files)

**ViewerFooter.svelte (1,141 → ~200 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `components/LandscapeFooterControls.svelte` | ~200 | Landscape layout variant. |
| `components/MidFooterControls.svelte` | ~250 | Mid-width two-row variant. |
| `components/DesktopFooterControls.svelte` | ~250 | Desktop single-row variant. |

ViewerFooter becomes layout switcher: ResizeObserver + conditional delegation.

**FeedbackKanbanBoard.svelte (1,012 → ~790 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `components/DeferFeedbackDialog.svelte` | ~120 | Defer dialog markup + handlers + CSS. |
| `components/TrashFeedbackDialog.svelte` | ~100 | Trash confirmation dialog + handlers + CSS. |

**WorldSceneContent.svelte (1,206 → ~840 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `services/terrain-material-factory.ts` | ~215 | Texture loading, material creation, chunk mesh factory. |
| `services/world-game-loop.ts` | ~190 | tickWorldSystems(delta, state) per-frame function. |

### State extractions (5 files)

**DeepOceanLab.svelte (1,166 → ~816 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `state/deep-ocean-lab-state.svelte.ts` | ~200 | Canvas lifecycle, layer/quality/stats state, spawn commands. |
| `services/fish-behavior-controls.ts` | ~150 | Mood/wobble/rare behavior triggers, color helpers, hunting. |

**PhraseEffortLabModule.svelte (1,073 → ~700 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `state/phrase-effort-lab-state.svelte.ts` | ~200 | Reactive state, playback loop, session persistence, timeline manipulation, presets. |
| `services/phrase-effort-lab-persister.ts` | ~60 | Firestore save logic. |

**SequenceActionsPanel.svelte (1,439 → 1,166 scanner lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `services/sequence-actions-orchestrator.ts` | 317 | Undo ordering, transform dispatch, extension workflows, pattern application, shift-start execution, and JSON copy. |
| `state/sequence-actions-panel-state.svelte.ts` | 377 | Inline navigation, persistence/restoration decisions, help and dialog state, extension data, and busy guards. |

The component remains the sole markup and CSS owner. See the shipped Sequence Actions decomposition design for the behavior locks and verification.

**DeckBrowser.svelte (1,011 → ~860 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `domain/deck-vtg-labels.ts` | ~50 | VTG_ABBREVIATIONS, VTG_FAMILY_LABELS, TURNS_TO_RATIO, formatTurnForTKA, capitalize. |
| `state/deck-interior-state.svelte.ts` | ~100 | Interior filters, filteredSequences/sequenceGroups/printSubgroups derived, groupByStartPosition, groupByFamily. |

**animation-visibility-state.svelte.ts (1,079 → ~840 lines)**

| Extracted module | Lines | Contents |
|---|---|---|
| `services/animation-visibility-migrations.ts` | ~100 | migrateStoredSettings(parsed) pure function. |
| `services/led-settings-section.ts` | ~140 | 12 LED-specific methods as a helper class. |

## Guidelines

- All new TS modules use kebab-case naming
- Svelte reactive state modules: `state/{concern}-state.svelte.ts` with `createFooState(deps)` factory
- Plain TS extractions: `services/{concern}.ts` or `domain/{concern}.ts`
- No behavior changes — pure structural refactors
- Each phase is independently shippable and verifiable
- Don't split data files (retro-icons.ts, museum-room-graph.ts)
- Don't create files under 50 lines
- Each extracted module should have clear inputs and outputs for future testability

## Expected Outcomes

| Metric | Before | After |
|---|---|---|
| Files over 1,000 lines | 47 | ~15 (FINE files + data files) |
| Files over 1,500 lines | 8 | 0 |
| Largest Svelte component script section | ~1,800 lines | ~400 lines |
| Largest TS service file | 2,252 lines | ~900 lines |
| Duplicated effect dispatch boilerplate | ~1,400 lines | ~100 lines |
| New independently testable modules | 0 (for these files) | ~50+ |

## Risks

1. **No test coverage.** None of the 47 files have tests. Verification is `npm run check` (typecheck) + `npm run build` + visual spot-checks.
2. **Reactive state threading.** `$effect` in `.svelte.ts` modules runs in component lifecycle only if instantiated during component init. Verify effects fire correctly after extraction.
3. **Circular dependencies.** When splitting a monolith, two extracted modules may both need a previously-private method. Extract shared utilities first.
4. **WebGL/WebGPU context ownership.** Only one module should own the GPU context. Others receive it as a parameter.
5. **CSS stays in components.** Svelte scoped styles are idiomatic. Don't extract CSS to separate files.
