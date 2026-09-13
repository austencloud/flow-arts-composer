# Canonical Capability Index

Search this file with `rg` for the concept being changed; do not read it
wholesale. Each row names the behavior owner. Verify the path in current code
before relying on it. Add a row only for shared behavior or an intentional
keep-separate decision, not for every component.

Sidebar prop pairs compose `SelectedPropPreview.svelte` with
`PropCompositionPreview.svelte`. Searches: prop button, paired composition,
fan appearance, primary prop colors. `prop-look.ts` owns build artwork and
`prop-composition-recipes.ts` owns placement; the Prop Button Lab tunes those
same recipes. Navigation reads the existing app settings for both hands,
chirality and colors. Drawer activation, haptics and navigation geometry keep
their existing owners.

Hand identity colors reuse `viewer-custom-colors.ts` for normalization and
`mandala-palette.ts` for overlap blending. Searches: primary prop colors,
hand-color key, mandala overlap, start-position legend. `PictographRenderer`
owns the SVG start key; `StartTile` and `LiveCardPictograph` compose that owner.
`ChoreoCard` resolves its palette once for cells and `CardGridLayout` mandalas.
Animation frame parameters carry the same hand pair independently of effect
styling, and `mandala-guide-painter.ts` derives overlap from its actual path
colors. New color-bearing annotations consume that resolved pair rather than
introducing baked blue/red or purple. Explicit artwork palettes retain their
existing override semantics.

Tunnel performer colors extend `sequence-viewer/tunnel/tunnel-prop-colors.ts`.
Searches: performer colors, shared hue, custom prop pair, layer colors.
`TunnelViewController` maps stable performer IDs to rendered stage order.
Textures, trails, LED sampling, prop-matched effects, and export consume that
resolved palette through `tunnelPerformerPair`. `TunnelColorSettings` composes
`LabeledColorPairPicker`, `SegmentedControl`, and `ScrubbableNumber` for editing.

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
| layout motion, reflow, panel presence, reorder, FLIP                                                                                | `shared/transitions/motion.ts`, `shared/panels/PanelGroup.svelte`, Svelte `animate:flip` with `flipDuration()`, and `shared/transitions/layout-flip.ts`; see `.claude/rules/no-layout-shift.md`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| step grid, pictograph preview swap, visual slot identity, difficulty and LOOP metadata                                              | `features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte` owns document-vs-slot identity; `SequenceMetadataRail.svelte` owns compact difficulty and LOOP indicators                                                                                                                                                                                                                                                                                                                                                                                                                             |
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
Discovery: `generateForSequence`, `qr-image-cache`, `prepared-scan-card`,
`warmSequenceCells`, `pictograph-cloud-cache`. Decision: extend these owners;
do not introduce a second QR renderer or scan-asset preparation pipeline.
