# Canonical Capability Index

Search this file with `rg` for the concept being changed; do not read it
wholesale. Each row names the behavior owner. Verify the path in current code
before relying on it. Add a row only for shared behavior or an intentional
keep-separate decision, not for every component.

Isolation pose teaching extends `/test/grip-lab` and `ContactIsolationPerformer`.
Searches: negative space, isolation keyframe, pose handle, torso turn, elbow
route, tip drift. `shared/3d/performers/isolation-keyframes.ts` owns the cyclic
smoothstep sampling extracted from the negative-space reach page; that page
and `routes/test/grip-lab/isolation-teaching.ts` both consume it. The latter
owns bounded teaching channels and URL serialization. `PoseHandles` composes
Three.js `TransformControls` with semantic proxy objects, never animated bones.
Its native lifecycle bypasses the extras wrapper: that wrapper's reactive
attach/change feedback detached a handle mid-drag and froze pose editing.
Only native `objectChange` events author poses; raycasting and gizmos remain
owned by Three.js. `AuthoredContactPose` in the scene-3d patch
extends the existing strict contact animator with opt-in body inputs.
The production `collision/stance-yaw-track.ts` remains the automatic anticipatory
stance owner; it does not author these user-taught poses. This lab intentionally
eases to rest at each taught pose instead of choosing anticipation itself.

Grip Lab's `KeyframeTimeline.svelte` presents these whole-pose keys at their
actual phase and plots the same shared lean sampler. It extends the existing
`contact-inspection-state.svelte.ts` owner for add, delete, retime, undo/redo,
and previous/next keyframe selection;
it does not own another animation clock. Searches: timeline, keyframe,
ScrubbableNumber, unified playback. `UnifiedTimeline` owns sequence playback,
not authored pose timing; the lab retains its existing `TransportControls`
and composes `PanelButton` and `ScrubbableNumber` for keyframe actions and
retiming. Closely spaced markers use separate rows so each remains selectable.
Grip Lab shortcuts compose `KeyboardShortcutManager`, `ShortcutRegistry`,
`registerEditHistoryShortcuts`, and `EditHistoryShortcutBridge`. Searches:
hotkeys, keyboard deletion, redo, editable focus. The test route has no app
shortcut coordinator, so `GripLabShortcuts.svelte` owns a page-lifetime registry
and disposes it on navigation. `grip-lab-shortcuts.ts` supplies lab actions and
reuses shared editable/widget/layer target guards. Help uses the same binding
definitions with the shared `Drawer` and `KeyboardKeyDisplay` primitives.

Sequence sharing extends `shared/share/components/PostShareSheet.svelte`.
Read `docs/architecture/sharing-export-experience.md` for the retained research,
entry-context decisions, browser constraints, and acceptance checks.
Searches: share, download, export, send to a friend, transfer to phone, caption.
The compact menu offers Copy link, an inbox attachment, and one file path.
Download and external file sharing use the same preview and prepared file;
they must not become competing setup flows. Both the menu's Download and an
Export shortcut open file settings. Download video owns preparation and delivery;
opening settings does not render. Cancel clears pending delivery and restores
editable settings.
Copy progress and results stay
inside the Copy link action. `sequence-viewer/state/viewer-shell-share-state.svelte.ts`
owns the source session; the sheet composes existing card preview and viewer
export owners, then reuses `shared/share/services/post-handoff.ts` for delivery.
Download is explicit; sharing to another app is capability-based on desktop
and mobile. Transfer to phone explains that it uploads the prepared file.
Export shortcuts enter that same sheet. Live scene recording retains its stage
controls. Account connection and publishing use a separate explicitly entered,
developer-gated publishing view; they do not occupy ordinary download settings.
Do not add another renderer or delivery modal for a new sharing entry point.

Sidebar prop pairs compose `SelectedPropPreview.svelte` with
`PropCompositionPreview.svelte`. Searches: prop button, paired composition,
fan appearance, primary prop colors. `prop-look.ts` owns build artwork and
`prop-composition-recipes.ts` owns placement; the Prop Button Lab tunes those
same recipes. Navigation reads the existing app settings for both hands,
chirality and colors. Drawer activation, haptics and navigation geometry keep
their existing owners.

Prop selection and appearance use
`shared/settings/components/tabs/prop-type/PropGrid.svelte` for the gallery,
family drill-down, Back/Escape navigation, and animated decision screens.
`BentoPropGrid.svelte` connects that presentation to account settings;
`PropSelectionSheet.svelte` provides the bounded Change Prop drawer.
Searches: prop look, model artwork, prop variants, Change Prop, fan styles.
`PropLookPicker.svelte` composes `PropBuildPicker.svelte` for captured model
versus pictograph artwork. `FanStyleOptionsCore.svelte` composes the existing
`FanAppearancePicker.svelte` for fan builds and covers. The effect tuner and
viewer reuse this gallery; `ScenePropPicker.svelte` adds scene-specific finish
controls. Extend these owners instead of appending another appearance picker
or creating a separate variant catalogue.

Hand identity colors reuse `packages/render-composition/src/hand-colors.ts` for
cross-runtime normalization and `mandala-palette.ts` for overlap blending.
`viewer-custom-colors.ts` retains the app-facing compatibility API. Searches: primary prop colors,
hand-color key, mandala overlap, start-placement legend. `packages/render-core`
owns the hand key's geometry plus its shared Canvas painter and standalone SVG
serialization (`calculateHandColorKeyLayout`, `drawHandColorKey`, and
`renderHandColorKeySvg`); callers supply their resolved colors and canvas context.
The user toggle is the
`handColorKey` glyph in `VisibilityStateManager` (export panel `Hand key` chip),
carried as `showHandColorKey` through `PreviewCellRenderOptions`,
`LayerRenderOptions` and `visibilityOverrides`. `PictographRenderer`
draws it in the live DOM (viewer start cell), `LayerCompositor` draws it into
the rasterized step-0 cell for card fronts, exports and thumbnails through
`drawHandColorKey`, and the MCP `StandaloneRenderer` draws it for
`generate_pictograph` and the sequence image start cell, so every surface
bakes in the same key.
The prop timing-and-direction glyph (`propTndGlyph` visibility key, `showPropTnD` render flag, `Prop TnD` chip, default off) reuses the same element art as the hand glyph but sits in the top-right slot. `derivePropElementalTypeForStep` in `shape-matrix/domain/prop-relationship.ts` classifies one step's props (null for a start position, float, or unequal turn rates) by delegating the bearings, the phase rule and the timing bands to the engine's `classifyPropRelationship` in `packages/sequence-engine/src/generation/prop-relationship.ts`, so the generator's prop constraint and every glyph agree; `getElementalGlyphBox` in `elemental-glyph-layout.ts` owns the slot geometry; `ElementalGlyph` (`corner="top-right"`) draws it in the DOM, `drawPropElementalGlyph` in `canvas-2d-glyph-renderer.ts` draws it for card fronts and exports, and the MCP `StandaloneRenderer` draws it through `renderPropTnDGlyph` under the `showPropTnD` option. The 2D animation canvas draws it in `GlyphOverlay` behind the animation engine's own `propElementalGlyph` setting ("Prop TnD" in both animation display panels).

Timing and direction as a generator setting lives on the Generate bento's TnD card. `shared/create/domain/hand-relationship.ts` owns the vocabulary (`TnDSelection` is `"free"` or a `VtgMode`, `describeTnDSelection`, `handModeToEngine`, `propModeToEngine`); `features/choreo-card/components/TnDModeGrid.svelte` is the one 3x2 mode picker (the Fuse picker wraps it); `features/create/generate/components/cards/TnDPanel.svelte` and `TnDCard.svelte` are the workspace and the card; `tndLoopCompatibility` and `handModesBlockedByLoop` in `shared/create/services/loop-type-utils.ts` own the cross-disabling between a hand mode and a LOOP. Searches: hand relationship, prop relationship, TnD card, together same, quarter opposite, match turns. Do not add a second mode grid or a second compatibility table.

`ChoreoCard` resolves its palette once for cells and `CardGridLayout` mandalas.
Animation frame parameters carry the same hand pair independently of effect
styling, and `mandala-guide-painter.ts` derives overlap from its actual path
colors. New color-bearing annotations consume that resolved pair rather than
introducing baked blue/red or purple. Explicit artwork palettes retain their
existing override semantics.

Compact turn/ratio pickers reuse
`shared/shape-matrix/app/components/TurnNotationControls.svelte`. Searches:
turn notation, ratios picker, left turn, right turn. It composes the canonical
matrix turn labels and `ShapeMatrixValueScroller`; callers provide their turn
palette, colors, and selection callbacks.

Tunnel performer colors extend `sequence-viewer/tunnel/tunnel-prop-colors.ts`.
Searches: performer colors, shared hue, custom prop pair, layer colors.
`TunnelViewController` maps stable performer IDs to rendered stage order.
Textures, trails, LED sampling, prop-matched effects, and export consume that
resolved palette through `tunnelPerformerPair`. `TunnelColorSettings` composes
`LabeledColorPairPicker`, `SegmentedControl`, and `ScrubbableNumber` for editing.

Pair color editing is owned by `shared/ui/components/LabeledColorPairPicker.svelte`.
Searches: color picker, color pair, prop colors, swatch, preset, hex, eyedropper, hue.
Its saturation/hue surface is `svelte-awesome-color-picker` (MIT) rendered
inline through `color-picker/BareWrapper.svelte`; the swatch matrix is
generated by `scripts/generate-color-presets.mjs` into `shared/ui/color-presets.ts`.
Callers pass `onswap` for a one-call swap and may pass a `preview` snippet.
`ProfileColorPicker` reuses the presets for a single color.

Standalone 3D workspaces compose `shared/3d/components/Viewer3DFullscreen.svelte`,
which owns the scene canvas, adaptive `SceneControlWorkspace`, and shared
timeline/tempo controls. Local character generators extend its HUD and inspector
slots. `shared/3d/context/character-catalog-context.ts` supplies a reactive,
host-scoped catalog to the existing `PerformerCharacterPicker`; other hosts keep
the standard catalog. Searches: scene workspace, environment picker, performer
selection, BPM, generated characters. Sequence selection remains with
`shared/components/sequence-picker/SequencePickerModal.svelte`.

Static placement transforms reuse `PictographContainer`'s `motionStartData`,
`motionStep`, and `motionProgress` seam. `pictograph-motion-positioner` maps the
2D animator's paths onto exact prepared start/end poses; `prop-placement-view-model`
builds paired arc/linear transitions, and `createPropPlacementMotionState` owns
the readiness-gated clock. Construct's arrival and placement editor keep their
existing consumers. Searches: static pictograph animation, mirror, flip, swap,
rotation, arrival motion. Learn queues actions and shares one clock across its
three examples; it does not own another renderer or interpolation system.
For synchronized grid rotation, `PictographContainer.gridRotation` carries that
clock's cumulative angle through `PictographRenderer` to `GridSvg.rotationOverride`.
This opt-in bypasses the grid's independent mode-change animation and global
direction setting; other pictograph consumers retain their existing behavior.

Timing-and-direction route continuity composes the existing `HandMotionPlayer`,
`reparentToInspector` mounted-node action (also consumed by `ArtPane`), and
`navigationMorphs`/`runNamedRouteMorph` route driver. Searches: persistent player,
canvas handoff, reparent, shared element. The TnD `+layout.svelte` owns one player
and context state across the hub and articles; route slots move its host without
remounting it. `MarketingChrome` keeps one content key for this subtree only.

Playback continuity between the Sequence Viewer and Post Studio keeps one
mounted compact `UnifiedTimeline`, including its scrubber and play button.
Its `reparentToInspector` flight opts into `createLayoutMotion` with
`resize: "layout"`: the row changes width without scaling its controls. Other
surface flights retain transform scaling. Searches: playback continuity,
scrubber replacement, transport resizing.

A card growing into its workspace (the Generate bento's Customize, LOOP,
Setups and TnD cards) routes through `startMorph` from
`shared/transitions/results-morph.ts` with names stamped by
`claimedViewTransitionName`; the feature seam is
`features/create/generate/shared/services/generate-card-morph.ts` and the
host is `ExpandedCardStage.svelte`. Searches: card morph, expand card, grow
card, bento expand, settings panel morph. Do not FLIP a card into a panel by
hand; claim the name on both ends and wrap the state change.

Shared-surface stacking extends `reparentToInspector`: control flights use the
controls layer and may wait for the canvas to dock, using viewer-local
`canvasMoving` rather than the aggregate moving flag. Canvas raster sizing
remains owned by `CanvasResizer`; it measures untransformed layout pixels, not
the flight's painted rectangle. Searches: blurry canvas, backing-store density,
scrubber occlusion, flight stacking.

Sequence Viewer ↔ Post Studio surface continuity uses the same
`reparentToInspector` action with `createLayoutMotion`. Viewer-local
`createViewerStudioSurfaces` owns the canvas/inspector/Card/transport loan and composition-clock
handoff; Studio slots request the mounted surfaces through its optional context.
Standalone Studio and additional simultaneous animation slots retain their own
renderers. Desktop motion and Card settings stay in the shell's persistent layers;
`inspectorContent` remembers the selected Studio source kind across mode changes.
Card-to-Studio switches fade between different settings or retain the same Card
settings, without reparenting their contents into an outgoing hidden layer.
The desktop inspector keeps its original outer track; compact Studio
uses destinations for the same surfaces. The canvas flight captures its visual
child before the transport changes allocation. Searches: Post Studio, persistent
canvas, shared inspector, shared Choreo Card, shared playback bar, live handoff.

| Search vocabulary                                                                                                                   | Canonical owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scene boot, scene switch, persistent worker renderer, poster handoff, shader warmup, GLB prefetch                                   | `shared/3d/worker-renderer/` owns the persistent production worker for all ten environments; `shared/3d/scene-boot/` owns legacy main-thread boot (Record Scene); `shared/3d/rendering/viewer-lighting-rig.ts` owns viewer lighting; environment worlds under `shared/3d/environments/worlds/` stay renderer-neutral with thin Svelte and worker adapters                                                                                                                                                                                                                                                                  |
| filter, chip, pill, toggle row, segmented selector                                                                                  | `FilterChipBase` for independent toggles; `SegmentedControl` for exactly-one selection; see `.claude/rules/chip-primitives.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| crossfade, keyed swap, canvas handoff, animated height                                                                              | `shared/components/Crossfade.svelte` for cheap keyed content; `shared/components/DualSourceCrossfade.svelte` for heavy or stateful sources (`clip={false}` preserves stage-owned overflow controls); see `.claude/rules/crossfade-primitive.md`                                                                                                                                                                                                                                                                                                                                                                            |
| layout motion, reflow, panel presence, reorder, FLIP, intrinsic modal height                                                                                | `shared/transitions/motion.ts` (`createIntrinsicHeightMotion` through `BaseModal.animateSize` for content-sized dialogs), `shared/panels/PanelGroup.svelte`, Svelte `animate:flip` with `flipDuration()`, and `shared/transitions/layout-flip.ts`; see `.claude/rules/no-layout-shift.md`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| step grid, pictograph preview swap, visual slot identity, difficulty and LOOP metadata                                              | `features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte` owns document-vs-slot identity; `SequenceMetadataRail.svelte` owns compact difficulty and LOOP indicators                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Choreo Card image export, MCP sequence image, renderer profile, packaged glyph assets                                               | `packages/render-composition/src/sequence-card-pipeline.ts` owns card composition and `COMPOSER_CARD_EXPORT_PROFILE_V1`. Composer and both MCP adapters consume that profile. `static/images/letters_trimmed/` owns TKA glyph artwork; `mcp-server-pkg/scripts/sync-card-assets.mjs` generates the publishable package copy during builds. Extend these owners instead of copying layout logic, defaults, or glyph files.                                                                                                                                                                                                  |
| BPM, tempo, tap tempo, speed preset                                                                                                 | `shared/animation-engine/domain/tempo-behavior.ts` and `shared/animation-engine/domain/constants/timing.ts`; presentations are `BpmChips.svelte` and `TempoControl.svelte`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| effect preview, preset lab, continuous demo                                                                                         | `InfiniteSequenceGenerator` and `isEffectPreviewLoop`; see `.claude/rules/sequence-generation.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| sequence transform, mirror, flip, invert, rotate, reset                                                                             | `shared/create/services/sequence-transformer.ts`; action tiles use `shared/create/components/SequenceTransformActions.svelte`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| contact juggling, contact ball, palm grid                                                                                           | `shared/3d/domain/prop-motion-discipline.ts` routes disciplines; contact state and poses belong to `features/contact-lab`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| performance video, collaborative video, upload, step map                                                                            | `shared/video-collaboration/state/sequence-videos-store.svelte.ts` owns the list; performance workspace state owns selection and mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3D prop picker, prop family, prop build, finish, bare hands                                                                         | `shared/3d/components/controls/ScenePropPicker.svelte`, `shared/3d/domain/scene-prop-catalog.ts`, and `propFinishState`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| artifact revision, immutable subject, content digest                                                                                | `shared/artifact-revisions/domain/artifact-revision.ts`; tunnel and sequence persistence use their domain revision owners                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| nested motion, coordinate node, carrier track, world trajectory, arbitrary Mandala layers                                           | `shared/motion-composition/` owns recursive sampling and clock mapping; `shared/mandala/` owns trajectory baking, projection, layer adaptation, timed reveal and SVG export. `TrajectoryMandala.svelte` presents the stationary canvas.                                                                                                                                                                                                                                                                                                                                                                                    |
| autocomplete, typeahead, async suggestion, combobox                                                                                 | `shared/ui/components/AsyncSuggestionCombobox.svelte`; callers supply search and row presentation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| legacy tunnel, reopen saved tunnel, rebuild tunnel cast                                                                             | `features/tunnel-collection/domain/collected-tunnel-source.ts`; viewer and creator handoff owners consume it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| locomotion, exact steps, stops, turns, pivots, crossed stepping, foot IK, motion matching                                           | `shared/3d/locomotion/destination-walk-plan.ts`, `@austencloud/scene-3d` `LocomotionAnimator` and `FootPlanter`, and `features/stage/locomotion/motion-matching/`; see `.claude/rules/locomotion.md`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| run, sprint, gait tier, acceleration, braking, air control                                                                          | `@austencloud/scene-3d` `LocomotionAnimator`, `packages/camera-3d/src/lib/ground-velocity.ts`, and `shared/3d/diagnostics/gait/gait-verdicts.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3D performer select, drag, pick proxy, spatial undo                                                                                 | `shared/3d/components/performer-interaction/`; arbitrary-object editing with `TransformControls` remains separate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| natural-language Stage direction, cast-wide appearance assignment, formation transition                                             | `features/stage/domain/tika-director.ts` owns the action contract, `features/stage/services/tika-director-service.ts` owns planning and assignment, and `features/film-director/domain/resolve-directives.ts` owns reusable constrained assignment                                                                                                                                                                                                                                                                                                                                                                         |
| alpha-tested foliage, coverage-preserving mipmaps                                                                                   | `shared/3d/rendering/alpha-coverage-mipmaps.ts` and `prepareCoveragePreservingAlphaMipmaps()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| standing stance, stance width, base of support                                                                                      | `@austencloud/scene-3d/src/lib/services/leg-geometry.ts`; see `.claude/rules/locomotion.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| rAF loop, offscreen pause, viewport gate, visibility state, frame budget                                                            | `shared/render-gating/render-activity-gate.ts`; specialized boot and export owners may hold or externally drive that gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| canvas2d effect, emitter tips, custom effect surface                                                                                | `shared/effects/services/canvas2d-effect-host.ts`; the render registry owns normal in-loop dispatch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Firestore reads, query bounds, indexes, egress                                                                                      | `.claude/rules/firestore-cost-discipline.md` and `firestore.indexes.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| environment map, image-based lighting, IBL, RoomEnvironment, PMREM, scene.environment, specular fill, flat PBR, metal renders black | `shared/3d/rendering/room-environment.ts` owns the prefiltered neutral room: `getRoomEnvironmentTexture(renderer)` builds three.js `RoomEnvironment` through one `PMREMGenerator` per renderer and caches the texture. Consumers set `scene.environment` and `scene.environmentIntensity` themselves and clear both on teardown (the bake-off route, and Ocean through `ocean-scene-appearance.ts`). The production performer viewer has no environment map today; adding one is a viewer decision with visual verification. HDRI or scene-specific environments are a different owner. Do not build a second PMREM cache. |

When no owner exists, record the search evidence and establish one owner. A
different style or smaller API is not a separate capability.

Choreo Card handoffs extend `ChoreoCard.svelte` (`onReady`: decoded cells, QR,
and completed cell entrances). Published scan links extend its existing
`choreo-card-qr-state.svelte.ts` (`qrUrl`) and `getUrlQRCodeGenerator`, rather
than minting account-owned short codes. Discovery: `onRenderProgress`,
`onRenderSettled`, `generateForUrl`, and `showQRCode`; lesson cards compose
these owners with `createLayoutMotion` and `DualSourceCrossfade`.

QR display reuses `shared/qr/services/qr-code-generator.ts` and extends
`qr-image-cache.ts` with `prepared-qr-cache.ts`: a successful preparation stores
the artwork and short link locally and in `prepared-qrs/{contentHash}.json`.
The key includes `encodeSequence`, canonical cell keys for both themes, and QR
URL/style options. A cache hit bypasses warming and short-code allocation;
only a completed strict warm can publish a cache entry. `warm-sequence-cells.ts`
owns canonical cell enumeration and probes shared cells before rendering.
Gallery thumbnail QR upgrades extend `ThumbnailRenderOrchestrator`: a signed-in
reader first sees the no-QR preview, then one background job prepares the exact
scan-ready QR. Guests only ask `ThumbnailRenderer.hasPreparedQR` for public
prepared artwork. A miss, lookup failure, or background preparation failure
keeps the preview.
Discovery: `generateForSequence`, `qr-image-cache`, `prepared-scan-card`,
`warmSequenceCells`, `pictograph-cloud-cache`. Decision: extend these owners;
do not introduce a second QR renderer or scan-asset preparation pipeline.
