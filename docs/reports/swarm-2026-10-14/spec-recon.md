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

## MOVE CANDIDATES

Shipped: none. Archived: none. No reviewed spec has all scoped acceptance evidence or a documented wholesale replacement established by this review.

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

## NEEDS AUSTEN

- Instagram: owned-account capability proof, Meta access/app review, and review of exact content before any live publication; no external action attempted.
- Staff lesson: VIDEO-001 approved media and complete-page review before release; fixture implementation can proceed separately.
- Wall-depth solver: labeled real fixtures and visual acceptance remain explicit human gates for eventual implementation.

## Verification

Pending final npm run specs:check, npm run specs:test, and git diff --check.

## NOT REACHED

Unverified queue, active first then backlog, filename order (excluding reviewed specs):

- `active/2026-04-20-sequence-engine-unification-design.md`
- `active/2026-04-24-native-mobile-integration-design.md`
- `active/2026-05-04-god-file-decomposition-design.md`
- `active/2026-05-12-spatial-lab-design.md`
- `active/2026-05-25-mandala-roadmap.md`
- `active/2026-05-28-animation-engine-rearchitecture-design.md`
- `active/2026-05-28-inspect-panel-redesign-design.md`
- `active/2026-05-30-deriver-collapse-design.md`
- `active/2026-05-31-ceremony-phase5-stateless-isolated-design.md`
- `active/2026-05-31-unified-generation-vocabulary-design.md`
- `active/2026-06-04-header-pattern-glyphs-design.md`
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
- `backlog/2026-05-23-accessibility-fixes-design.md`
- `backlog/2026-05-23-firebase-cost-optimization-design.md`
- `backlog/2026-05-23-spacing-token-system-design.md`
- `backlog/2026-05-23-utility-deduplication-design.md`
- `backlog/2026-05-24-viewer-orchestrator-state-machine-design.md`
- `backlog/2026-05-25-mandala-phase3-shareable-links-design.md`
- `backlog/2026-05-25-prop-selection-redesign-design.md`
- `backlog/2026-07-16-beat-to-step-nomenclature-design.md`
- `backlog/2026-07-31-qft-one-surface-design.md`
- `backlog/2026-08-01-scene3d-treeshaking-followup-design.md`
- `backlog/2026-08-30-3d-scene-zero-jank-startup-design.md`
- `backlog/2026-09-04-post-studio-screen-take-source-design.md`
