# Spec reconciliation, 2026-10-14

Observed baseline: 35592b1077b2a2f5003e315887aabaaebcb24d8a, branch codex/swarm-spec-recon; initial git status --short was empty. Review is limited to this worktree. No product code, external accounts, builds, browser sessions or other worktrees were changed.

Method: read each reviewed spec completely; inspect named source paths/symbols and scoped git log --oneline --since=<spec-date> -- <paths> (and git log -S for key symbols). Missing historical paths were followed with rg --files. Tests listed as present below were inspected, not executed; queue verification is recorded separately. Scores and dependencies are preserved. The dated opening note makes old execution instructions historical without rewriting the design.

| spec | old work_state | new work_state | evidence (short) | confidence |
| --- | --- | --- | --- | --- |
| `active/2026-05-20-scene-composer-design.md` | unverified | verification | 4b80394d85, 0823c21071; inventory below | high |
| `active/2026-08-06-ink-production-context-redesign.md` | unverified | verification | 3dae20082a, e7a90da6dc; inventory below | high |
| `active/2026-08-11-2d-fire-renderer-upgrade.md` | unverified | verification | 31da45c190, 887f92af09; inventory below | high |
| `active/2026-08-14-instagram-publishing-workspace-design.md` | blocked | blocked | 717ba711a2; inventory below | high |
| `active/2026-09-02-rational-ratio-theory-atlas-design.md` | unverified | verification | 6720731a94, dd6947dd4f; inventory below | medium |
| `active/2026-09-11-generate-setup-detach-on-edit-design.md` | unverified | verification | 9a0121bc76, eb3a767bff; inventory below | high |
| `backlog/2026-05-23-3d-scene-performance-design.md` | unverified | in-progress | b14aedf1ea; inventory below | high |
| `backlog/2026-05-25-mandala-phase2-trails-design.md` | unverified | ready | 7d1dfff785, d88b6e934c; inventory below | high |
| `backlog/2026-05-29-glb-environment-registry-design.md` | ready | ready | 24fab771cc, 66d9541160; inventory below | high |
| `backlog/2026-07-27-staff-choreography-first-lesson-design.md` | blocked | blocked | f59e0af77c, a97b743f05; inventory below | high |
| `backlog/2026-08-30-3d-scene-zero-jank-startup-design.md` | unverified | ready | 7d1dfff785, dfe4d3cafa, a97b743f05; inventory below | high |
| `active/2026-06-04-header-pattern-glyphs-design.md` | unverified | ready | 7de49088a8, eca23555b1; inventory below | high |
| `backlog/2026-05-23-accessibility-fixes-design.md` | unverified | in-progress | 7d1dfff785, b44d0acb4c, a97b743f05; inventory below | high |
| `backlog/2026-07-13-wall-plane-depth-solver-design.md` | ready | ready | f558fd9fc9, f13606f440, acb57580f7; inventory below | high |
| `backlog/2026-07-28-release-notes-deep-linking-design.md` | ready | ready | 24a63db357, 18e572b3b9; inventory below | high |
| `active/2026-04-20-sequence-engine-unification-design.md` | unverified | in-progress | 8e2070ea59; inventory below | high |
| `active/2026-04-24-native-mobile-integration-design.md` | unverified | in-progress | d25b918eaa, 7ba33e00bf; inventory below | high |
| `active/2026-05-04-god-file-decomposition-design.md` | unverified | in-progress | 8bc4149650, 3f0e5016b9, a97b743f05; inventory below | high |
| `active/2026-05-12-spatial-lab-design.md` | unverified | superseded | f4d3d52089, 6b040a60a1, 4e4cae6c51; inventory below | high |
| `active/2026-05-25-mandala-roadmap.md` | unverified | in-progress | 443c7b6fec, 7e6d7ed3bf; inventory below | medium |
| `active/2026-05-28-animation-engine-rearchitecture-design.md` | unverified | in-progress | 7b996f97fc, 3f0e5016b9, a97b743f05; inventory below | high |
| `active/2026-05-28-inspect-panel-redesign-design.md` | unverified | verification | 208399cd2b; inventory below | medium |
| `active/2026-05-30-deriver-collapse-design.md` | unverified | in-progress | 9c064a8255; inventory below | high |
| `active/2026-05-31-ceremony-phase5-stateless-isolated-design.md` | unverified | in-progress | 6e56d6d30e, 51c6225f15, a97b743f05, ccc58d970e; inventory below | high |
| `active/2026-05-31-unified-generation-vocabulary-design.md` | unverified | in-progress | 4848592d56, e45ce2268f; inventory below | high |

## Evidence inventories and verdict rationale

### active/2026-05-20-scene-composer-design.md

Observed: `src/lib/shared/3d/scene-composer/` contains types, registry, editor, ghost, picker, composed model, validation, save state, file/manifest persistence and dev endpoint. `register-scene-lab-composer-plugins.ts` imports all ten plugins; scene placement modules exist. Museum imports `createMetadataSceneObjectAdapter` and shared `CommandStack` (MuseumSceneEditor lines 25–55). Winter generator/manifest/sidecar and tests under `tests/unit/scene-composer/` exist; registry and instance-map tests contain explicit coverage assertions. History: `4b80394d85 feat(scene-composer): generic editor, save state, and per-scene plugins`; `0823c21071 fix(scene-composer): preserve authored winter tree roles`. Inference: implementation exists; current browser/asset acceptance was not rerun. The old phase checklist is historical and Firebase is a future non-goal.

Remaining: Verify current ten-scene Compose and museum edit/save/reload behavior, locked objects, instance identity, and Winter asset hashes against the recorded baseline; shared adapters, registry, persistence, and coverage tests already exist (4b80394d85, 0823c21071). Firebase persistence is explicitly future scope, not a reason to rebuild the dev editor.

### active/2026-08-06-ink-production-context-redesign.md

Observed: all seven scoped files exist in `src/lib/shared/effects/{translators,renderers}`, `src/routes/test/ink-presets/`, and `tests/unit/effects/ink-2d-renderer.test.ts`. Route-local `InkProductionPreview.svelte` uses AnimatorCanvas and `persist: false` (line 33). Translator supplies strokeGravityPx/strokeLengthPx; renderer trims at lines 603/810 and applies gravity at 802. Tests assert Watercolor zero gravity, dense India gravity, width, scaled bounds and composites; later Sumi/Neon intentionally have zero attached gravity. History: `3dae20082a feat(effects): tune 2D ink for production playback`; `e7a90da6dc feat(effects): give dense Ink a broad nib and a wet gloss that dries`. Inference: remaining work is current runtime/export evidence, not initial implementation.

Remaining: Run the existing Ink renderer/translator tests and capture production playback, seven-viewport review, and deterministic export parity; stroke gravity, path-length limits, Watercolor branches, and isolated AnimatorCanvas preview already exist (3dae20082a; tests/unit/effects/ink-2d-renderer.test.ts). Review current dense-palette behavior after e7a90da6dc rather than restoring the original material.

### active/2026-08-11-2d-fire-renderer-upgrade.md

Observed: `web-gl-fire-renderer.ts` implements emission mapping (101), scalar quality (121), profile/cache keys (144–152), presentation buffers, batched splats, MacCormack (1277–1292), and sprite matte (1543 onward). `fire-frame-cache.ts` enforces capacity/bypass. `src/routes/test/fire-2d-compare/+page.svelte` exists; quality, explicit-dt, cache playback, and brightness tests exist under `tests/unit/animation-engine/`. History: `31da45c190 feat(effects): upgrade fire and smoke fluid rendering`; `887f92af09 fix(effects): resolve tip points per render key and keep fire caches honest`. Inference: source is built; shader/browser/export acceptance is outstanding for this review.

Remaining: Verify real WebGL2 shader compilation, synchronized legacy/cinematic playback, sprite-matte crossings, cached/headless export parity, and seven-viewport performance on /test/fire-2d-compare. The upgraded renderer, cache budget and focused tests already exist (31da45c190; src/lib/shared/animation-engine/services/fire/web-gl-fire-renderer.ts).

### active/2026-08-14-instagram-publishing-workspace-design.md

Observed: all five Instagram schema/policy files, `state/post-delivery-state.svelte.ts`, `context/post-delivery-context.ts`, `components/instagram/InstagramPostReview.svelte`, `firebase-functions/src/share/instagramCapabilities.ts`, existing Meta client/connect/publish owners and `tests/unit/share/instagram-publishing-contract.test.ts` exist. The proposed audio, carousel publisher, publication queue/reconciler, post reader, recipe/publication repository and remaining named UI components are not present at proposed paths. History: `717ba711a2 feat(post-studio): add Instagram publishing workflow`. Capability code distinguishes permissions/account type; no live account calls were made. Inference: partial implementation plus explicit external gates, not complete. Proposal: gate-by-gate proof ledger before any later capability is enabled.

Remaining: Continue from the implemented schemas, delivery state, InstagramPostReview and server capabilities (717ba711a2); do not restart Gate 0/1. Establish owned-account proof and Austen review before live publishing, then complete gated carousel/Story/Trial, Facebook audio, scheduling/reconciliation and published-post management; the proposed queue/audio/reader owners are absent under firebase-functions/src/share.

### active/2026-09-02-rational-ratio-theory-atlas-design.md

Observed: `packages/vtg-domain/src/reference/spin-ratio.ts` owns reduction, parsing, exact turn fractions, closure, joint closure, petals and bounded Farey catalog. `qft-model.ts`, Theory pane/detail/controls, Theory state and playback clock exist. Tests: `tests/unit/vtg-spin-ratio.test.ts`, `qft-rational-ratios.test.ts`, `shape-matrix/theory-*.test.ts`. History: `6720731a94 wip(shape-matrix): exact-rational Theory Atlas through denominator 9`; `dd6947dd4f feat(shape-matrix): allow arbitrary ratios through 15`. State now has two ratio axes/pairings. Inference: implementation evolved beyond the one-ratio design; original URL/visual acceptance still needs explicit evidence. No documented wholesale replacement decision established, so not superseded.

Remaining: Verify exact ratio/closure suites, legacy URL compatibility and current Theory/Level 4 transitions at the seven viewports. The arithmetic, QFT geometry and Theory UI exist (6720731a94), and dd6947dd4f expanded ratios through 15; validate that evolution instead of rebuilding the original denominator-9 atlas.

### active/2026-09-11-generate-setup-detach-on-edit-design.md

Observed: favorite state stores appliedSource/appliedBaseline (96–97), derives equality-based activeSource (118–120) and active-only status (124); save/update/delete/load paths use the applied provenance. `SavedSetupRow.svelte:41` disables update for `isActive || disableMutations || isBusy`. PresetCard, card-configurator, generator-contract-types, GeneratePanel and snapshot tests exist; old PresetDrawer and its test do not. `tests/unit/create/favorite-state.test.ts:185–212` asserts active → null → active. History: `9a0121bc76 feat(generate): detach a saved setup as soon as any control changes`; `eb3a767bff fix(generate): favorite state guards and discriminating tests`. Inference: implementation exists; current browser acceptance and renamed drawer coverage remain to verify. The approved/awaiting-plan instruction is historical.

Remaining: Verify apply/edit/revert behavior in the current Setups UI and run favorite-state and snapshot coverage. Detachment and reattachment already exist in favorite-state.svelte.ts and SavedSetupRow disables Update for the active match (9a0121bc76); the old PresetDrawer target has been removed, so use its current replacement rather than recreating it.

### backlog/2026-05-23-3d-scene-performance-design.md

Observed: LunarCrystals creates one material per cluster; vegetation has materialCache and disposal. WorldSceneContent lines 747–752 use 1024/50, but 788/793 set model/child castShadow=true. ObsidianPillars keeps uniform uSeed and per-pillar material; no InstancedMesh/LOD there. Vegetation lines 221/471 still disable culling. Rainbow/Ocean/Forest paths changed; old AutumnForest/FishSchool/ReefStructures/ocean-instancing/UnderwaterParticles names were not found in current shared 3D file inventory, while cosmic-instancing, GodRayShafts (now ocean/runtime/atmosphere), EmberFountains, EnergyParticles and MeteorStreaks remain. Viewer3DCanvas coordinates shared shader warmup. History: `b14aedf1ea perf(3d): shader warm-up, material sharing, frustum culling, shadow right-sizing`. Inference: partial completion; the old per-scene instructions need adaptation, not replay.

Remaining: Finish or explicitly retire the remaining per-object LOD, ObsidianPillars instancing, vegetation culling and WorldSceneContent shadow-caster limits. b14aedf1ea implemented portions, but ObsidianPillars still uses per-pillar uSeed materials, instanced-vegetation.ts keeps frustumCulled=false, and WorldSceneContent still enables model/child castShadow despite its 1024 map and 50m frustum; remeasure current shared warmup instead of adding old per-scene compile calls.

### backlog/2026-05-25-mandala-phase2-trails-design.md

Observed: MandalaPane, MandalaControlDock, mandala-renderer and mandala-types exist. `rg -n 'ghostBuffer|trailEnabled|trailLength|suppressGlow|GhostFrame' src/lib/shared/sequence-viewer src/lib/shared/mandala` returned no matches. MandalaViewerControls is absent. Scoped history contains `7d1dfff785 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock` and `d88b6e934c perf(mandala): prepare the change morph once and measure each shape once`, neither establishes trails. Inference: feature remains unbuilt; target relocation alone is not implementation.

Remaining: Implement ghost capture, bounded trails, controls and matching export compositing on the current MandalaPane/MandalaControlDock owners. No ghostBuffer, trailEnabled, trailLength, GhostFrame or suppressGlow implementation exists in shared mandala/sequence-viewer; 7d1dfff785 changed the motion owner, so the old MandalaViewerControls and local RAF instructions are historical.

### backlog/2026-05-29-glb-environment-registry-design.md

Observed: named new registry/loader/manifest files absent from `rg --files src static scripts`; Environment3D and OceanScene exist. Environment3D switch remains (100–119); no registry-first branch found. History: `24fab771cc fix(3d): retain complete scenes during instrumented transitions`; `66d9541160 feat(winter): build Blue Hour Lodge through Blender pipeline`. Inference: previous false-positive adjudication stands; no implementation or manifest license gate established.

Remaining: Implement the self-describing scene manifest, typed registry, shared GlbEnvironment loader and license assertion, then prove a second GLB entry and Ocean parity. Current Environment3D.svelte still dispatches BackgroundType at lines 100–119 and no environment-registry.ts, GlbEnvironment.svelte or scene.json was found under src/static/scripts; 24fab771cc changes transitions, not this registry.

### backlog/2026-07-27-staff-choreography-first-lesson-design.md

Observed: `src/routes/(public)/learn/staff-spinning-choreography/+page.server.ts` returns 404 outside dev; +page.svelte retains noindex and UnderConstruction. `rg -l 'LessonMediaRequest|ApprovedLessonMediaPackage' src` returned no matches. Gate test exists; reused SequenceHeroDemo/InlineAnimationPlayer/SegmentedControl/Seo and synced-playback/StepMap owners are existing infrastructure, not evidence of this lesson's A/B/C fixture or approved media. History: `f59e0af77c fix(landing): withdraw unfinished public pages`; subsequent route edits include `a97b743f05` migration. Inference: Stage 1 fixture is not established; earlier remaining text claiming Stage 1 done was incorrect. VIDEO-001 dependency preserved.

Remaining: Build the contract-valid fixture lesson and shared synchronized playback integration, then obtain the VIDEO-001 approved media package and Austen release review. Current route only preserves the production 404/noindex gate (f59e0af77c); no LessonMediaRequest or ApprovedLessonMediaPackage appears in src, so the gate must not be mistaken for completed Stage 1.

### backlog/2026-08-30-3d-scene-zero-jank-startup-design.md

Observed: manager, coordinator, Viewer3DScene, Viewer3DCanvas and SceneControlWorkspace exist; proposed scene-effect-task-scheduler-3d.ts does not. Manager lines 2–24 statically import pooled effect classes and initialize lines 154–166 allocate all listed pools. Workspace lines 2/18/21 statically import MobileSceneControls, SaveSceneModal and SceneControlInspector. Viewer3DCanvas has shared warmup/reveal coordination, but that does not satisfy the demanded effect-slot architecture. History: scoped log includes `7d1dfff785` motion migration, `dfe4d3cafa` performer controls and `a97b743f05` toolchain migration. Inference: the central implementation is absent; no current trace evidence established. Keep the retirement note as historical context, not completion proof.

Remaining: Implement demand-loaded pooled effects and conditional control imports, then measure the specified 1080p/4K startup and reveal acceptance. scene-effects-manager-3d.ts still statically imports renderers and initializes every pool at lines 154–166, SceneControlWorkspace imports closed controls eagerly, and scene-effect-task-scheduler-3d.ts is absent despite later startup work (7d1dfff785).

### active/2026-06-04-header-pattern-glyphs-design.md

Observed: TurnPatternGlyph, ReversalPatternGlyph, reversal-patterns and reversal-matcher remain feature-local; proposed shared glyph/sequence-pattern paths are absent. Actual header owner is `src/lib/shared/animation-engine/components/layers/WordHeader.svelte`; `rg -n 'TurnPattern|ReversalPattern|turnGlyph|reversalGlyph' src/lib/shared/animation-engine src/lib/shared/video-export` returns no matches. Export owners are now `src/lib/shared/video-export/services/{canvas-renderer,export-frame-compositor}.ts`. History: `7de49088a8 feat(motion): animation surfaces move on the shared motion clock`; `eca23555b1 fix: render current shop hero card fronts and inverse word groups`. Inference: reusable glyphs are pre-existing dependencies; header/export feature remains unbuilt.

Remaining: Promote turn/reversal domain and glyph primitives, wire capped raw signatures into WordHeader/AnimatorCanvas, and add video-export parity. Glyphs and reversal modules remain under features/choreo-card, no turnGlyph/reversalGlyph wiring was found in animation-engine or video-export, and 7de49088a8 changed header motion rather than implementing this scope.

### backlog/2026-05-23-accessibility-fixes-design.md

Observed: all named current UI owners exist; proposed 3d/utils/reduced-motion.ts does not. Environment3D has prefersReducedMotion at 130/265 and worker worlds consume reducedMotion, so the old claim of zero coverage is obsolete, but full viewer/effect override/static-glow acceptance is not established. CardInspectModal has no FocusTrap; MotionVisibilityToggle only handles Escape and retains role=button backdrop plus dialog without modal/focus management; LegalSheet lines 1–45 has no trap and unhidden backdrop. BottomNavigation nav (183 onward) lacks aria-label. ChoreoCardThumbnail has dynamic button labels (869). SidebarFooter retains 0.25/0.15 alpha (520/542); AccountPopover version link retains opacity 0.6. ViewerOverflowMenu has since moved to drawer-related infrastructure, so its old backdrop snippet is historical. History: `7d1dfff785` shared motion, `b44d0acb4c` surface alignment, `a97b743f05` migration. Inference: mixed existing improvements and concrete remaining gaps. Proposal: do not implement the scan-radio nonissue.

Remaining: Complete focus containment/restoration in CardInspectModal, MotionVisibilityToggle and LegalSheet, label BottomNavigation, and fix SidebarFooter/AccountPopover contrast before keyboard, screen-reader and reduced-motion acceptance. ChoreoCardThumbnail now has labels and Environment3D has reduced-motion handling, but LegalSheet still lacks focus trapping and SidebarFooter retains 0.25/0.15 icon alpha; the scan-radio item is explicitly a false positive in this spec.

### backlog/2026-07-13-wall-plane-depth-solver-design.md

Observed: `wall-feasibility.ts` declares withCheat and optional depthOffset, and wall-feasibility-scanner/concavity-solver plus their tests exist. `rg --files src tests scripts` finds no depth-feasibility-solver, scan-wall-feasibility or elbow-pole-computer named target. No solveStepDepth producer established. History for metadata includes `f558fd9fc9 refactor(app): complete performer-relative hand migration` and `f13606f440 feat(library): archive SpiroAnim quarter-space sequences`. The spec's `acb57580f7` is historical experimental evidence, not proof of depth solver delivery. Inference: ready implementation gap; future labeled-fixture and visual gates remain.

Remaining: Implement solveStepDepth and its scanner/renderer integration using existing wall-feasibility and concavity owners; the depth solver, scan-wall-feasibility.ts and depth-solver test are absent, while wall-feasibility.ts only declares depthOffset/withCheat (f558fd9fc9). Reconcile current IK owner paths, then validate reachable crossing fixtures, scan-version behavior and Austen's visual gate before claiming a working cheat.

### backlog/2026-07-28-release-notes-deep-linking-design.md

Observed: version models, release gate/script, hooks and current settings-owned WhatsNewModal, whats-new-state, ChangeGroupSection and VersionDetailContent exist. `toPublicChangelog` returns only category/text. No release-tour/data-release-anchor or --debt implementation found in scoped search; current seen state has high-water-mark storage but that is pre-existing scaffolding. History: `24a63db357 fix(release-notes): render **bold** runs instead of raw asterisks`; `18e572b3b9 chore(release): prepare v0.44.1 and fix visibility validation`. Inference: topical traffic does not implement this contract; forward-only migration and legacy behavior still apply.

Remaining: Implement release entry metadata retention, validated Show me navigation/arrival state, unread discovery/rollup, release-aware reload copy and release-debt reporting. toPublicChangelog still strips entries to category/text (scripts/lib/release-module-gate.mjs:610–612), and release-tour/data-release-anchor are absent; 24a63db357 only changes rich-text rendering.

### active/2026-04-20-sequence-engine-unification-design.md

Observed: canonical `packages/tka-types/src/{step,motion,builders}.ts` exist; StepData extends Step with app fields and derived left/right reversals, rather than being deleted. Engine deriveReversals and unit tests exist. App `sequence-extender.ts:318` calls completeLOOPExtension; `generate/circular/` no longer contains Strict executors. `8e2070ea59 Unify LOOP extension completion in the sequence engine` deletes the app executors/registrations and adds package completion, MCP/app/QR regression tests. `docs/architecture/loop-execution.md` documents replacement semantics, including rejection of quartered rewound and orientation-based completion. MCP package adapter imports engine; build.mjs bundles it. Old deployment/functions/broadcast path is absent. Selection state exists under create/shared/state/selection; no reversal-backfill filename was found in src/packages/scripts. Package version 0.1.0 is observed locally, not evidence of registry publication. Inference: Phase 3 remainder is obsolete, while full multi-phase scope has unresolved migration and external acceptance. No production database or npm query performed.

Remaining: Retire the stale Phase 3 rebuild instruction: 8e2070ea59 removed app LOOP executors and routes extension through completeLOOPExtension, documented in docs/architecture/loop-execution.md. Reconcile the retained StepData subtype contract and remaining broadcast, production reversal/backfill and package-publication acceptance; current source and local package version 0.1.0 do not establish the required production monitoring or npm release.

### active/2026-04-24-native-mobile-integration-design.md

Observed: android exists and ios does not; AndroidManifest includes tka.run and /q/, /sequence/, /store/. Both well-known link files and ios-build/android-build workflows exist, but AASA contains `TEAMID.com.tkaflowarts.composer` and src/app.html:536 comments out an XXXXX app-id banner. package.json/config and native initializer/platform detector/haptics implement the native foundation; native-google-auth dynamically imports @capacitor-firebase/authentication rather than the old proposed plugin. Capgo updater and incoming share-target are dependencies. `rg -n 'sqlite|@capacitor/share|@capacitor/filesystem|bluetooth-le|capacitor-nfc' src package.json` returned no matches. Card scan, share intake and update services exist, but physical per-card tracking/store/subscription/recording/BLE/NFC acceptance was not established. History: `d25b918eaa feat(app): show phone app updates and restart into them`; `7ba33e00bf fix(app): keep the update button out of web browsers`. Inference: partial implementation; do not infer store absence or account state solely from repository contents. Proposal: revalidate historical pricing/policy and cloud-build choices before release, without treating this metadata review as release authorization.

Remaining: Finish iOS project/signing/link configuration, durable native SQLite/filesystem cache and outgoing share, then validate device/store/OTA and premium hardware acceptance. Android, native Google auth, Capgo updates and incoming share intake exist (d25b918eaa), but ios/ is absent, apple-app-site-association retains TEAMID, and the smart banner is commented out; incoming share-target support does not implement @capacitor/share delivery.

### active/2026-05-04-god-file-decomposition-design.md

Observed: full named-file inventory was checked with rg --files plus Python basename/kebab-case resolution and line counts. Phase 1 registry dispatch exists in animation-render-loop (dispatchEffect, line 1252; loop at 2086), and EffectRendererManager uses EFFECT_PLUGINS/generic overlay lifecycle; AnimationEngine is 830 lines. Phase 2: choreo-card layout/cell pipeline and renamed crossfader exist; feature ChoreoCard is 310 lines, shared viewer ChoreoCard 1520 (distinct owners). All four museum helpers exist; Museum3DScene is 2404 lines. library-action-handler, shared fullscreen controller and save-panel-state exist; CompositionLab/old SaveToLibraryPanel names are absent (current SaveToLibraryView/Dialog exist). Phase 3: library-recycle-bin/batch-operations, group-conversation-manager/mappers, canvas-2d glyph/transform helpers, card-composer/cell-border-renderer, export-frame-compositor, flag admin/defaults, auth boot/profile updater, collision diagnostic/pose mapper all exist. Phase 4: webgpu trail/shaders, terrain CPU/mesh/skirt, chunk messages/types/zones, all three footer variants, defer/trash dialogs, terrain material/world loop, deep-ocean state/fish controls, phrase-effort state/persister, sequence-actions state/orchestrator and animation-visibility-migrations exist. Named deck-interior/deck-vtg-labels, led-settings-section and editing-pane-persistence are absent; old DeckBrowser/DeepOceanLab/CompositionLab are no longer named owners. ViewerFooter is 157 lines, repository 1884, orchestrator 1383; line counts are observations, not quality verdicts. History: `8bc4149650 fix(library): route batch, recycle-bin, conflict, and labeler writes through the public-sequence persister`; `3f0e5016b9` animation layers and `a97b743f05` migration show subsequent growth. Inference: many extractions landed; remaining scope needs responsibility review, not replay of all 28 splits.

Remaining: Rebaseline remaining responsibility splits against current owners, then verify behavior for any additional extraction; the old claim that library-repository and viewer orchestration were untouched is obsolete. library-repository imports extracted batch/recycle services (8bc4149650), museum helpers and viewer action/fullscreen/footer splits exist, but Museum3DScene is now 2404 lines and animation-render-loop 2817, so original line targets alone cannot establish completion.

### active/2026-05-12-spatial-lab-design.md

Observed: `f4d3d52089 feat(spatial-lab): replace SVG canvas with 3D avatar scene` explicitly records deleting SpatialCanvas plus six SVG components, using Scene3D/Avatar3D/Prop3D, adding snapping, migrating demo sequences/state and preserving analysis via a 2D projection bridge. Commit body reports 61 tests passing and build/type checks at that time; these are historical claims, not checks run here. Current files under `src/lib/features/lab/tabs/spatial-lab/` contain SpatialLab, SpatialScene, controls/status, view/toggle/info/preset/sequence/transport controls, state/constants and body rotation/reach/crossing/plane split/projection/grid snap/taxonomy/demo services. Eight tests exist under `tests/unit/spatial-lab/`, contradicting the old 'No tests' remainder. Sequence mode shipped in `6b040a60a1`, taxonomy in `4e4cae6c51`. Inference: explicit replacement commit supports superseding this architectural record; it does not certify today's UI acceptance. Proposal: coordinator moves to archived, not shipped.

Remaining: Archive this original SVG architecture record after coordinator review: f4d3d52089 explicitly replaces SpatialCanvas and its six SVG children with SpatialScene/Scene3D/Avatar3D, preserving analysis through projection. Current implementation and eight focused spatial-lab test files live under src/lib/features/lab/tabs/spatial-lab and tests/unit/spatial-lab; any new runtime acceptance should target that replacement, not rebuild the SVG design.

### active/2026-05-25-mandala-roadmap.md

Observed: Phase 1 MandalaPane/SequenceMandala/render/export owners exist. Phase 2 trail symbols are absent as recorded above. Phase 3 has collection/publication/revision services and viewer URL infrastructure, but no exact-settings tka.run acceptance established. Phase 4 has meditation session, audio, types/defaults, controls/overlay wired into MandalaModule; history `443c7b6fec feat(mandala): implement MeditateTab with mandala selector and default mandalas`, followed by `7e6d7ed3bf refactor(mandala): unify 3-tab module into single-panel gallery`. Phase 10 has mandala-path-interpolator and morphChanges integration in SequenceMandala plus Shape Matrix morph owner; full two-sequence selection/path-correspondence acceptance not established. No phase-specific formations/chains/FFT/fractal/tessellation/extrusion implementation identified in mandala module/shared owner inventories. Separate phase 2/3 specs already exist in backlog; phase 4–11 designs are in backlog/someday (read-only, outside this worker's edit scope). Inference: roadmap partially implemented beyond viewer; no whole-roadmap completion or new duplicate specs justified.

Remaining: Continue from the existing viewer/export, meditation and collection/publication owners; meditation is implemented in src/lib/features/mandala/tabs/meditate (443c7b6fec), and shape morphing exists in mandala-path-interpolator.ts. Trails remain absent, while exact-settings short links, formations/chains, FFT reactivity, fractal nesting, tessellation and 3D extrusion still need their own acceptance review; reuse the existing phase specs instead of creating duplicates.

### active/2026-05-28-animation-engine-rearchitecture-design.md

Observed: animator-state.svelte.ts supplies per-instance state; animation-engine constructs CanvasLifecycleManager, EffectSystem, PropSystem, FrameSystem and playback coordination. Effects registry and renderer map/generic lifecycle exist. `managers/playback-sync.ts:82` creates StateSynchronizer and lines 761 onward pull service state. Actual AnimatorCanvas has no self-import; CanvasSurface/SplitCanvasView only mention it historically in comments. DisassembleCanvasView/DisassembleTransition exist. OffscreenExportRenderer calls RenderContextFactory.createOffscreenContext (130); factory tests explicitly assert createLiveContext absent (71–73). Searches find no old resize/restore callbacks or AnimatorCanvas full-reload plugin in current owners. History: `7b996f97fc refactor(animation-engine): lift manager systems out of implementations/`; subsequent `3f0e5016b9` layers and `a97b743f05` migration. Inference: mirroring remains a concrete architectural gap, while obsolete factory/HMR instructions must not be replayed. Runtime HMR/export acceptance not run.

Remaining: Remove or explicitly retire the remaining service-state mirroring in managers/playback-sync.ts, which still owns StateSynchronizer; per-instance animator state and manager extraction already exist (7b996f97fc). Verify current offscreen export and split/disassemble HMR, and reconcile the intentionally absent createLiveContext API (asserted absent in render-context-factory.test.ts) rather than recreating the old stub.

### active/2026-05-28-inspect-panel-redesign-design.md

Observed: PictographInspectModal uses PictographContainer (475) and current dock; MotionColumn/PipelineTraceSection/CollapsibleSection exist, old BasicInfoColumn is absent. PipelineEditorDock line 78 types editTarget as special-json/default and options at 150–151 match it; it imports DefaultOverrideRepository and invalidates adjustment versions. PropGeometryAdjustmentRepository already implements saveAdjustmentLocal (147), deleteAdjustmentLocal (178), deleteAdjustment (186). History: `208399cd2b feat(arrows): inspect dock shows only Special + Default tiers` documents intentional divergence, invalidating the prior 'undocumented' claim. Current layout and tier correctness still need browser/persistence proof. Inference: implementation/replacement behavior exists; no reason to rebuild original tier UI solely from this spec. Not marking the entire design superseded because only the tier replacement decision was established.

Remaining: Verify live arrow selection/WASD, save/revert, readable responsive layout and theme behavior on the current PictographInspectModal/PipelineEditorDock. 208399cd2b deliberately narrows editing to Special + Default, and the prop-geometry repository already has local/save/delete methods; reconcile acceptance against that recorded tier change instead of restoring the original four-tier picker.

### active/2026-05-30-deriver-collapse-design.md

Observed: app `shared/render/core/calculations/orientation.ts` still defines deriveHandOrbitalDirection (93) and deriveMotionType (109) rather than re-exporting; package orientation has no matching exports. Create pattern-manager (358/373) and rotation-direction-handler (390/415) each define the partial helpers. Proposed motion-type-from-rotation.ts and orientation-golden-corpus.json were not found. MCP orientation-calculator is now a delegating shim to @tka/render-core, backed by `9c064a8255 fix(orientation): canonicalize orientation casing in render-core, delete mcp-server's copy`. Existing deriver-parity.test.ts compares package/app and an app sequence-engine wrapper, not the complete proposed snapshot guard. Assemble state no longer carries the old named calculator; `services/builder-motion-geometry.ts` uses angle helpers/trigonometry, so old line references are obsolete. Package OrientationCalculator remains the intended independent copy. Inference: B1 progressed; A and full C/guard acceptance remain. No TKA math was changed or independently certified in this review.

Remaining: Finish lifting the app derivers into render-core and replacing both create-module classifiers with one fallback-preserving adapter; these copies remain in orientation.ts, rotation-direction-pattern-manager.ts and rotation-direction-handler.ts. MCP already delegates after 9c064a8255, while the golden-corpus fixture and proposed motion-type-from-rotation.ts are absent; reconcile the current assemble-lab geometry owner before implementing the hash/center collapse.

### active/2026-05-31-ceremony-phase5-stateless-isolated-design.md

Observed: inventory script, manifest, flatten codemod and merge handoff exist. Manifest generatedAt is 2026-05-31T07:56:44.524Z, so its counts are not current. Inventory script writes scripts/ceremony-manifest.json (397) and ceremony-dry-run.md (493); it was read but not run. Handoff records MuseumGridBuilder, ArchiveLoaderImpl, CellCacheKeyDeriver, MultiFilter and BrowseSectionManager conversions and narrows viable candidates to consumption-safe cases. Current museum-grid-builder, archive-loader, cell-cache-key-deriver, multi-filter and browse-section-manager modules exist; deriveCacheKey, applyFilters/getFilteredCount, buildMuseumGrid and browse functions are exported. Scoped history includes `6e56d6d30e Add a Joined grids filter to Browse`, `51c6225f15` triangle grips and `a97b743f05` migration; handoff moved in `ccc58d970e`. Inference: 'no measurable progress' is false; no claim that historical aggregate targets are met. Proposal: future inventory must preserve guards/multi-instance owners and use the current authorized worktree policy, not the historical clone/rebase recipe.

Remaining: Reinventory the live conversion candidates and residual type/filename tail before further batches; do not reuse the May counts. The committed merge handoff and current function exports establish five Phase-5 conversions, contradicting the no-progress banner (docs/superpowers/handoffs/2026-05-31-ceremony-phase5-merge-handoff.md); scripts/ceremony-inventory.mjs still writes outside this worker's scope, so its manifest was not regenerated here.

### active/2026-05-31-unified-generation-vocabulary-design.md

Observed: deck-recipe.ts uses canonicalJSON/cyrb128 and mints seeds; DeckRelease has schemaVersion/generatorVersion fields. Canonical JSON/seeded RNG utilities and their tests, deck-recipe/seeded-composer/deck-releaser recipe tests exist. `4848592d56 feat(deck-gen): seeded RNG + canonical JSON + recipe hashing utils` and `e45ce2268f feat(deck-gen): seeded composeDeck + loop/level/start-pos pool filters` establish implementation. ConfigureStep and generated archive UI exist. Current create RotationDirectionPattern and deck ResolvedReversalPattern remain separate; deck composer still processes enumerated seed entries and variant transforms. The named single normalized parameter owner/write path, complete cache wipe/rebuild benchmark and all three surface adoption criteria were not established. Inference: foundation and deck work are partial scope, not evidence of whole-vocabulary collapse. Preserve design decisions about deliberate lossy macro changes and seed/version pinning.

Remaining: Finish or explicitly revise the single reversal/turn model and shared write-path contract across Generate, deck and sequence-actions; RotationDirectionPattern and ResolvedReversalPattern still coexist. Reuse recipe hashing/seeding and seeded composer tests (4848592d56, e45ce2268f), then establish full pool rebuild, version-migration and cross-surface acceptance instead of treating prior Phase 1/2 labels as proof.

## MOVE CANDIDATES

Shipped: none. Archived: active/2026-05-12-spatial-lab-design.md. Replacement decision f4d3d52089 explicitly deletes SVG canvas components and adopts SpatialScene/Scene3D/Avatar3D; see inventory. Coordinator must move the file; no move performed here.

## REBUILD HAZARDS

- CONFIRMED: `active/2026-05-20-scene-composer-design.md`. Reuse existing scope; inspect the remaining gap above.
- CONFIRMED: `active/2026-08-06-ink-production-context-redesign.md`. Reuse existing scope; inspect the remaining gap above.
- CONFIRMED: `active/2026-08-11-2d-fire-renderer-upgrade.md`. Reuse existing scope; inspect the remaining gap above.
- CONFIRMED: `active/2026-08-14-instagram-publishing-workspace-design.md`. Reuse existing scope; inspect the remaining gap above.
- CONFIRMED: `active/2026-09-02-rational-ratio-theory-atlas-design.md`. Reuse existing scope; inspect the remaining gap above.
- CONFIRMED: `active/2026-09-11-generate-setup-detach-on-edit-design.md`. Reuse existing scope; inspect the remaining gap above.
- CONFIRMED: `backlog/2026-05-23-3d-scene-performance-design.md`. Reuse existing scope; inspect the remaining gap above.
- CLEARED: `backlog/2026-05-25-mandala-phase2-trails-design.md`. Traffic does not establish the requested deliverable; see evidence above.
- CLEARED: `backlog/2026-05-29-glb-environment-registry-design.md`. Traffic does not establish the requested deliverable; see evidence above.
- CLEARED: `backlog/2026-07-27-staff-choreography-first-lesson-design.md`. Traffic does not establish the requested deliverable; see evidence above.
- CLEARED: `backlog/2026-08-30-3d-scene-zero-jank-startup-design.md`. Traffic does not establish the requested deliverable; see evidence above.
- CLEARED: `active/2026-06-04-header-pattern-glyphs-design.md`. Traffic does not establish the requested deliverable; see evidence above.
- CONFIRMED: `backlog/2026-05-23-accessibility-fixes-design.md`. Reuse existing scope; inspect the remaining gap above.
- CLEARED: `backlog/2026-07-13-wall-plane-depth-solver-design.md`. Traffic does not establish the requested deliverable; see evidence above.
- CLEARED: `backlog/2026-07-28-release-notes-deep-linking-design.md`. Traffic does not establish the requested deliverable; see evidence above.

## NEEDS AUSTEN

- Instagram: owned-account capability proof, Meta access/app review, and review of exact content before any live publication; no external action attempted.
- Staff lesson: VIDEO-001 approved media and complete-page review before release; fixture implementation can proceed separately.
- Wall-depth solver: labeled real fixtures and visual acceptance remain explicit human gates for eventual implementation.

## Verification

npm run specs:check: 194 specs checked; 0 invalid (exit 0).

npm run specs:test: tests 6; pass 6; fail 0; cancelled/skipped/todo 0 (exit 0).

git diff --check: no output (exit 0), including final metadata batch.

Commit batch 1: 86e67ae4e7 docs(specs): reconcile first ten rebuild-hazard candidates.

Additional eventual decisions: native mobile needs iOS signing/store identity, device proof and unresolved monetization/hardware choices; sequence-engine production backfill/publication require evidence and separate external authorization. No such action was taken.

## Coverage and limits

Reviewed all 15 flagged specs and the first 10 additional unverified active specs in filename order (25 total). No moves or score changes. Stopped at a scoped commit boundary; unvisited records are listed below.

Batch 2 commit: 3715b80351 docs(specs): reconcile remaining flags and oldest active records.

Feature tests and browser/device/production checks were not run. The ceremony inventory command was not run because it writes unowned scripts/ artifacts; its manifest and actual source were inspected. Negative searches are limited to the stated paths/symbols. Historical test claims are not current verification.

Scope check result: `PASS: 25 spec bodies preserved; only owned paths changed; metadata scores/dependencies preserved.` Unvisited queue: 95 unverified specs.

Reproducible scope check (PowerShell):

```powershell
python -c @'
import pathlib,subprocess,re
base='35592b1077b2a2f5003e315887aabaaebcb24d8a'
paths=subprocess.check_output(['git','diff','--name-only',base],text=True).splitlines()
specs=[p for p in paths if p.startswith('docs/superpowers/specs/')]
for p in specs:
 old=subprocess.check_output(['git','show',base+':'+p]).decode('utf-8').replace('\r\n','\n')
 new=pathlib.Path(p).read_text(encoding='utf-8')
 a=old.split('---',2);b=new.split('---',2)
 stripped=re.sub(r'\n\n> 2026-10-14 triage: [^\n]*','',b[2],count=1)
 assert stripped==a[2],p+' design body changed'
 for key in ['status','value','effort','depends_on','plan_path','tags']:
  assert re.search('^'+key+':.*$',a[1],re.M).group()==re.search('^'+key+':.*$',b[1],re.M).group(),p+' changed '+key
 assert b[1].count('last_triaged: 2026-10-14')==1,p
assert all(p in specs or p=='docs/reports/swarm-2026-10-14/spec-recon.md' for p in paths)
print('PASS:',len(specs),'spec bodies preserved; only owned paths changed; metadata scores/dependencies preserved.')
ledger=pathlib.Path('docs/reports/swarm-2026-10-14/spec-recon.md').read_text(encoding='utf-8')
print('NOT REACHED:',len(re.findall(r'^- ',ledger.split('## NOT REACHED')[1],re.M)),'unverified specs.')
'@
```

## NOT REACHED

Unverified queue, active first then backlog, filename order (excluding reviewed specs):

- `active/2026-06-12-canon-prop-creators-redesign.md`
- `active/2026-06-16-effect-leg-bolstering-design.md`
- `active/2026-06-16-modular-kit-museum-design.md`
- `active/2026-06-16-user-onboarding-overhaul-umbrella.md`
- `active/2026-06-21-enchanted-autumn-dusk-design.md`
- `active/2026-06-24-effect-defaults-tuning-progress.md`
- `active/2026-06-26-shop-transitions-design.md`
- `active/2026-06-30-reversal-derivation-reconciliation-findings.md`
- `active/2026-07-01-presence-as-signal-register.md`
- `active/2026-07-20-q-scan-instrumentation-ledger.md`
- `active/2026-07-22-first-session-activation-design.md`
- `active/2026-07-25-sequence-public-parity-repair-design.md`
- `active/2026-07-27-profile-stage-feedback-ledger.md`
- `active/2026-08-02-vulcan-cave-floor-plan-design.md`
- `active/2026-08-05-collection-message-sharing-design.md`
- `active/2026-08-05-repository-root-cleanup-design.md`
- `active/2026-08-05-shortcut-center-design.md`
- `active/2026-08-06-canonical-3d-stage-and-environment-transitions-design.md`
- `active/2026-08-06-library-all-results-first-design.md`
- `active/2026-08-06-living-autumn-clearing-design.md`
- `active/2026-08-06-museum-single-destination-and-light-rig-design.md`
- `active/2026-08-08-bramble-elsa-scene-coordination.md`
- `active/2026-08-08-construct-session-friction-recovery-design.md`
- `active/2026-08-08-create-history-motion-design.md`
- `active/2026-08-08-moonlit-winter-hollow-design.md`
- `active/2026-08-09-fathom-ocean-lighting-palette-handoff.md`
- `active/2026-08-09-fathom-ocean-world-boundary-design.md`
- `active/2026-08-09-ocean-composition-matrix-design.md`
- `active/2026-08-09-olive-cloudbreak-celestial-pivot.md`
- `active/2026-08-09-seraphic-vault-celestial-design.md`
- `active/2026-08-09-water-traverse-design.md`
- `active/2026-08-10-post-share-sheet-handoff.md`
- `active/2026-08-11-autumn-tree-shadows-design.md`
- `active/2026-08-11-deck-releaser-print-speed-and-layout.md`
- `active/2026-08-11-library-impersonation-identity.md`
- `active/2026-08-12-fluid-smoke-and-hot-core-design.md`
- `active/2026-08-12-specific-message-replies-design.md`
- `active/2026-08-13-2d-fish-character-system-design.md`
- `active/2026-08-13-choreo-indicator-restoration-design.md`
- `active/2026-08-13-deck-releaser-motion-system.md`
- `active/2026-08-13-inbox-inline-sequence-player-design.md`
- `active/2026-08-13-post-studio-composition-design.md`
- `active/2026-08-14-canonical-solo-prop-rendering-design.md`
- `active/2026-08-14-inbox-choreo-card-animation-stage-design.md`
- `active/2026-08-14-ink-sumi-material-redesign.md`
- `active/2026-08-15-3d-smoke-volume-rebuild-design.md`
- `active/2026-08-15-canonical-sequence-selection-drill-design.md`
- `active/2026-08-15-post-studio-slots-design.md`
- `active/2026-08-20-stage-3d-performance-studio-design.md`
- `active/2026-08-20-stage-performance-runtime-design.md`
- `active/2026-08-21-3d-studio-environment-separation-design.md`
- `active/2026-08-21-adaptive-scene-control-workspace-design.md`
- `active/2026-08-21-feedback-manage-adaptive-workspace-design.md`
- `active/2026-08-21-mobile-message-actions-design.md`
- `active/2026-08-21-notification-delivery-preferences-design.md`
- `active/2026-08-21-tunnel-creator-design.md`
- `active/2026-08-24-film-collection-design.md`
- `active/2026-08-25-director-control-surface-design.md`
- `active/2026-08-25-director-first-class-shell-design.md`
- `active/2026-08-27-account-profile-confidence-design.md`
- `active/2026-08-27-composer-info-polish-plan.md`
- `active/2026-08-27-progressive-3d-studio-design.md`
- `active/2026-08-28-chrome-taskbar-identities.md`
- `active/2026-08-28-prop-picker-gallery-design.md`
- `active/2026-08-28-prop-selection-unification-design.md`
- `active/2026-08-28-sequence-route-consolidation-design.md`
- `active/2026-08-30-3d-studio-interaction-contract.md`
- `active/2026-08-30-shared-fan-appearance-2d-design.md`
- `active/2026-08-30-tunnel-exact-prop-colors-design.md`
- `active/2026-08-31-compact-stage-prop-audit-design.md`
- `active/2026-08-31-flow-arts-software-history-redesign.md`
- `active/2026-08-31-left-right-motion-identity-migration-design.md`
- `active/2026-08-31-share-flow-content-ownership-design.md`
- `active/2026-09-01-sequence-viewer-inspector-layout-design.md`
- `active/2026-09-01-shape-matrix-stage-composition-design.md`
- `active/2026-09-02-film-director-adversarial-corpus.md`
- `active/2026-09-04-tunnel-cast-stage-separation-design.md`
- `active/2026-09-24-nav-sheet-fit-design.md`
- `active/2026-09-24-post-studio-breakdown-design.md`
- `active/effects-unification-deferred-items.md`
- `backlog/2026-04-01-museum-interior-design-system.md`
- `backlog/2026-04-04-arrow-tip-z-promotion-design.md`
- `backlog/2026-04-05-unified-view-toggle-and-perf-harness.md`
- `backlog/2026-04-11-collision-lab-future-work.md`
- `backlog/2026-04-15-unified-gpu-render-pipeline-design.md`
- `backlog/2026-05-23-firebase-cost-optimization-design.md`
- `backlog/2026-05-23-spacing-token-system-design.md`
- `backlog/2026-05-23-utility-deduplication-design.md`
- `backlog/2026-05-24-viewer-orchestrator-state-machine-design.md`
- `backlog/2026-05-25-mandala-phase3-shareable-links-design.md`
- `backlog/2026-05-25-prop-selection-redesign-design.md`
- `backlog/2026-07-16-beat-to-step-nomenclature-design.md`
- `backlog/2026-07-31-qft-one-surface-design.md`
- `backlog/2026-08-01-scene3d-treeshaking-followup-design.md`
- `backlog/2026-09-04-post-studio-screen-take-source-design.md`
