# Spec Index

Every design spec, handoff, audit and review sitting loose in this folder, with an evidence-backed status. **Archive-only policy: nothing here has been deleted or moved.** Status is a reading of the repository, not a verdict on the idea — a SUPERSEDED doc is still worth keeping, and a SHIPPED doc often has open follow-ups named in its Next action column.

**202 loose specs in `docs/superpowers/specs/`** (files already filed under `active/`, `backlog/`, `shipped/`, `archived/` and the named subfolders are not listed here).

| Status | Count | Meaning |
| --- | --- | --- |
| SHIPPED | 139 | The thing it describes exists in `src/` or landed in a named commit. |
| SUPERSEDED | 13 | A later doc replaced it, or the doc says so itself. |
| IN-FLIGHT | 23 | Partly built — an open ledger, an open branch, or a named blocker. |
| OPEN | 27 | Still an idea. Nothing built, nothing supersedes it. |

Nothing has been deleted or moved. This index is the only new file.

## Open ideas worth a look

Complete enough to hand to an executor, and nothing supersedes them.

| # | File | Why it is worth a look |
| --- | --- | --- |
| 1 | [`2026-08-02-notation-caps-4k-density-correction.md`](./2026-08-02-notation-caps-4k-density-correction.md) | 743-line PROPOSED spec, executor-ready, no successor. Just needs a yes or a no. |
| 2 | [`2026-08-05-sequence-combinator-redesign-design.md`](./2026-08-05-sequence-combinator-redesign-design.md) | Supersedes the shipped-then-rejected 08-04 lab. Three combinator docs below are blocked on this review. |
| 3 | [`2026-08-05-loop-detection-false-negatives-handoff.md`](./2026-08-05-loop-detection-false-negatives-handoff.md) | A real bug with a written repro: `detect_loop_pattern` is nondeterministic and misses loops. |
| 4 | [`2026-08-05-ghost-presence-design.md`](./2026-08-05-ghost-presence-design.md) | Austen approved it "full send" on 08-05 and nothing was built. Always-on breathing presence. |
| 5 | [`2026-08-10-scene-composer-all-scenes-handoff.md`](./2026-08-10-scene-composer-all-scenes-handoff.md) | Select/place/move/save exists for one scene; the handoff is the rollout to every Scene Lab scene. |
| 6 | [`2026-08-06-effects-3d-instancing-handoff.md`](./2026-08-06-effects-3d-instancing-handoff.md) | One unchecked item — the real-viewer parity sweep — stands between this and closed. |
| 7 | [`2026-08-05-vulcan-cave-ornament-grammar.md`](./2026-08-05-vulcan-cave-ornament-grammar.md) | The grammar is derived and written. Applying it per room is mechanical work with a spec to follow. |
| 8 | [`2026-08-28-stage-footfall-planning-handoff.md`](./2026-08-28-stage-footfall-planning-handoff.md) | Walk Lab footfall plans exist; wiring the Stage timeline to them is the last hop. |
| 9 | [`2026-08-28-gait-timing-plan-experiment.md`](./2026-08-28-gait-timing-plan-experiment.md) | A single named experiment with a stated hypothesis. Cheap to run, unblocks the gait thread. |
| 10 | [`2026-08-23-glossary-codex-recovery-handoff.md`](./2026-08-23-glossary-codex-recovery-handoff.md) | `/glossary` is an empty `+page.ts` on disk. The handoff says exactly what to rebuild. |
| 11 | [`2026-09-01-v0-40-release-writing-handoff.md`](./2026-09-01-v0-40-release-writing-handoff.md) | The release exists; only the user-facing notes are missing. Bounded writing task. |
| 12 | [`2026-08-27-tunnel-editing-handoff.md`](./2026-08-27-tunnel-editing-handoff.md) | Self-describes as nothing-pushed with the design settled — a clean pickup. |
| 13 | [`2026-09-01-composer-showcase-range-design.md`](./2026-09-01-composer-showcase-range-design.md) | Small, well-scoped: widen the Composer showcase past four beats. |
| 14 | [`2026-08-21-versioned-visual-artifact-publication-design.md`](./2026-08-21-versioned-visual-artifact-publication-design.md) | Publish tunnels, mandalas and scenes without exposing private saves. Design is complete. |
| 15 | [`2026-08-17-ocean-performer-command-bar-opus-test-handoff.md`](./2026-08-17-ocean-performer-command-bar-opus-test-handoff.md) | An acceptance pass, not a build. One cold run on `/test/ocean-scene` closes it. |

## By topic family

### museum/vulcan  <sub>13 shipped, 2 in-flight, 2 open, 9 superseded</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-05-vulcan-cave-ornament-grammar.md`](./2026-08-05-vulcan-cave-ornament-grammar.md) | design | **OPEN** | ba9c1a9541 derived the grammar; no per-room application commits | Apply the ornament grammar across the six rooms |
| [`2026-08-08-earth-root-observatory-opus-handoff.md`](./2026-08-08-earth-root-observatory-opus-handoff.md) | handoff | **OPEN** | only 90aa1b2f74 graybox+contract; review verdict not recorded | Run or close the independent Earth-room review |
| [`2026-08-06-first-fire-torch-procession-design.md`](./2026-08-06-first-fire-torch-procession-design.md) | design | **IN-FLIGHT** | 7b0b881f8a first-fire revival; 08-10 cinder-court rebuild continues it | Governing design for the Fire room rebuild |
| [`2026-08-10-first-fire-cinder-court-rebuild-handoff.md`](./2026-08-10-first-fire-cinder-court-rebuild-handoff.md) | handoff | **IN-FLIGHT** | f0f7dbd31b rebuild; still inside the museum-scene-production gate workflow | Continue the Cinder Court gates |
| [`2026-08-02-drowned-gallery-aesthetic-push-plan.md`](./2026-08-02-drowned-gallery-aesthetic-push-plan.md) | plan | **SUPERSEDED** | room rebuilt as "the Ring" (df52cef9bf) |  |
| [`2026-08-02-drowned-gallery-cold-review-codex.md`](./2026-08-02-drowned-gallery-cold-review-codex.md) | review | **SUPERSEDED** | reviewed the pre-Ring graybox |  |
| [`2026-08-02-drowned-gallery-cold-review-opus.md`](./2026-08-02-drowned-gallery-cold-review-opus.md) | review | **SUPERSEDED** | reviewed the pre-Ring graybox |  |
| [`2026-08-04-first-fire-design.md`](./2026-08-04-first-fire-design.md) | design | **SUPERSEDED** | self-marked; replaced by 2026-08-06 torch procession |  |
| [`2026-08-04-vulcan-cave-all-rooms-concepts.md`](./2026-08-04-vulcan-cave-all-rooms-concepts.md) | design | **SUPERSEDED** | wing completed cf43588a71; Sun section superseded by the Sundial design |  |
| [`2026-08-06-first-fire-torch-procession-handoff.md`](./2026-08-06-first-fire-torch-procession-handoff.md) | handoff | **SUPERSEDED** | replaced by 2026-08-10 cinder-court rebuild handoff |  |
| [`2026-08-08-first-fire-gate-1-floor-plan-candidate.md`](./2026-08-08-first-fire-gate-1-floor-plan-candidate.md) | design | **SUPERSEDED** | self-marked CANDIDATE; cinder-court rebuild replaced the 60x30 plan |  |
| [`2026-08-09-drowned-gallery-channels-design.md`](./2026-08-09-drowned-gallery-channels-design.md) | design | **SUPERSEDED** | df0d7548ed revert — "three channels rejected", back to the Ring |  |
| [`2026-08-09-first-fire-cinder-court-navigation-reset-handoff.md`](./2026-08-09-first-fire-cinder-court-navigation-reset-handoff.md) | handoff | **SUPERSEDED** | 9ed07584d2 handed the court off again for a ground-up rebuild |  |
| [`2026-08-02-drowned-gallery-graybox-handoff.md`](./2026-08-02-drowned-gallery-graybox-handoff.md) | handoff | **SHIPPED** | d6e2ff8d51 graybox; superseded by Ring v2 |  |
| [`2026-08-02-drowned-gallery-playtest-report.md`](./2026-08-02-drowned-gallery-playtest-report.md) | audit | **SHIPPED** | traversal defect fixed cf707da460 |  |
| [`2026-08-03-drowned-gallery-ring-flow-design.md`](./2026-08-03-drowned-gallery-ring-flow-design.md) | design | **SHIPPED** | df52cef9bf Ring v2; df0d7548ed reverted channels back to it |  |
| [`2026-08-03-vulcan-cave-fire-room-handoff.md`](./2026-08-03-vulcan-cave-fire-room-handoff.md) | handoff | **SHIPPED** | water room gated; fire shipped d07ad45706 |  |
| [`2026-08-04-earth-room-codex-review.md`](./2026-08-04-earth-room-codex-review.md) | review | **SHIPPED** | fixes applied 202a500908 |  |
| [`2026-08-04-earth-room-floor-plan-draft.md`](./2026-08-04-earth-room-floor-plan-draft.md) | design | **SHIPPED** | d462b23c06 earth room built |  |
| [`2026-08-04-vulcan-cave-earth-room-handoff.md`](./2026-08-04-vulcan-cave-earth-room-handoff.md) | handoff | **SHIPPED** | d462b23c06 earth built; self-marked superseded for Air+Moon |  |
| [`2026-08-05-earth-canyon-graybox-handoff.md`](./2026-08-05-earth-canyon-graybox-handoff.md) | handoff | **SHIPPED** | a828740e57 + c02fe06f92 pit defect resolved |  |
| [`2026-08-05-vulcan-cave-air-room-handoff.md`](./2026-08-05-vulcan-cave-air-room-handoff.md) | handoff | **SHIPPED** | 4a4220158f air rebuilt |  |
| [`2026-08-05-vulcan-cave-sun-moon-handoff.md`](./2026-08-05-vulcan-cave-sun-moon-handoff.md) | handoff | **SHIPPED** | 75ceb51cee + cf43588a71 wing complete |  |
| [`2026-08-05-vulcan-cave-sun-room-design.md`](./2026-08-05-vulcan-cave-sun-room-design.md) | design | **SHIPPED** | ba9c1a9541 / cf43588a71 |  |
| [`2026-08-05-vulcan-cave-sun-room-handoff.md`](./2026-08-05-vulcan-cave-sun-room-handoff.md) | handoff | **SHIPPED** | ba9c1a9541 |  |
| [`2026-08-08-earth-root-chasm-blender-design.md`](./2026-08-08-earth-root-chasm-blender-design.md) | design | **SHIPPED** | a706d020c5 earth root chasm graybox |  |

### create/generate  <sub>11 shipped, 3 in-flight, 1 superseded</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-13-fuse-generation-recipe-design.md`](./2026-08-13-fuse-generation-recipe-design.md) | design | **IN-FLIGHT** | branch codex/fuse-recipe-stage; ledger 9/16 | Finish the recipe drawer ledger on that branch |
| [`2026-08-13-fuse-generation-recipe-handoff.md`](./2026-08-13-fuse-generation-recipe-handoff.md) | handoff | **IN-FLIGHT** | branch codex/fuse-recipe-stage | Pairing drill pages + Level-bound orientations |
| [`2026-09-01-continuous-filter-feedback-handoff.md`](./2026-09-01-continuous-filter-feedback-handoff.md) | handoff | **IN-FLIGHT** | branch+worktree codex/continuous-filter-feedback | Attach the causal feedback to the owning control |
| [`2026-08-05-start-position-sequence-repositioning-design.md`](./2026-08-05-start-position-sequence-repositioning-design.md) | design | **SUPERSEDED** | self-marked; replaced by the integrated location controls design |  |
| [`2026-08-02-customize-panel-drilldown-design.md`](./2026-08-02-customize-panel-drilldown-design.md) | design | **SHIPPED** | TurnPatternSection.svelte documents itself as "one screen of the Customize drill" |  |
| [`2026-08-05-extend-drawer-orientation-repeat-design.md`](./2026-08-05-extend-drawer-orientation-repeat-design.md) | design | **SHIPPED** | 9823fc1048 |  |
| [`2026-08-05-start-position-integrated-location-controls-design.md`](./2026-08-05-start-position-integrated-location-controls-design.md) | design | **SHIPPED** | fa60c2fa1e |  |
| [`2026-08-08-create-duration-editing-design.md`](./2026-08-08-create-duration-editing-design.md) | design | **SHIPPED** | 0d473b6bb4 (self: IMPLEMENTED 2026-08-08) |  |
| [`2026-08-08-duration-editing-audit-handoff.md`](./2026-08-08-duration-editing-audit-handoff.md) | audit | **SHIPPED** | 6fdb70e5c6 audit -> spec implemented same day |  |
| [`2026-08-10-start-position-motion-design.md`](./2026-08-10-start-position-motion-design.md) | design | **SHIPPED** | self "implemented same-session"; cf61a48650 |  |
| [`2026-08-16-generative-turn-configuration-design.md`](./2026-08-16-generative-turn-configuration-design.md) | design | **SHIPPED** | 94bba27f96 generate from a turn pattern; UI half landed as the turn-pattern redesign |  |
| [`2026-08-16-turn-pattern-redesign-design.md`](./2026-08-16-turn-pattern-redesign-design.md) | design | **SHIPPED** | 61c98d04c5 turn patterns under customize; b564ee0af3 sentence readback |  |
| [`2026-09-01-create-front-door-design.md`](./2026-09-01-create-front-door-design.md) | design | **SHIPPED** | 85fba2b3a4 + 7398d04599 responsive bento |  |
| [`2026-09-01-create-header-sequence-actions-design.md`](./2026-09-01-create-header-sequence-actions-design.md) | design | **SHIPPED** | b5233021da + 922d13dacb |  |
| [`2026-09-03-create-sequence-actions-handoff.md`](./2026-09-03-create-sequence-actions-handoff.md) | handoff | **SHIPPED** | self "integrated into local main; nothing in flight" |  |

### filter/collections  <sub>9 shipped, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-03-smart-collection-cold-audit-findings.md`](./2026-08-03-smart-collection-cold-audit-findings.md) | audit | **OPEN** | ledger 23/50 checked | Close or retire the 27 unchecked findings |
| [`2026-08-02-smart-collection-responsive-composer-audit-handoff.md`](./2026-08-02-smart-collection-responsive-composer-audit-handoff.md) | handoff | **SHIPPED** | 648c96b245 responsive composer redesign |  |
| [`2026-08-03-smart-collection-audit-fix-handoff.md`](./2026-08-03-smart-collection-audit-fix-handoff.md) | handoff | **SHIPPED** | 5182907937 universal stacking | Loose end #1 (grouped-rule Any/All sentence) — confirm landed |
| [`2026-08-04-gallery-split-pane-workspace-design.md`](./2026-08-04-gallery-split-pane-workspace-design.md) | design | **SHIPPED** | 6854d7e845 |  |
| [`2026-08-04-unified-filter-workspace-design.md`](./2026-08-04-unified-filter-workspace-design.md) | design | **SHIPPED** | bcb10e9430 |  |
| [`2026-08-04-unified-filter-workspace-execution-handoff.md`](./2026-08-04-unified-filter-workspace-execution-handoff.md) | handoff | **SHIPPED** | 92b06dcb55 ledger complete |  |
| [`2026-08-04-unified-filter-workspace-handoff.md`](./2026-08-04-unified-filter-workspace-handoff.md) | handoff | **SHIPPED** | superseded same-day by the execution handoff |  |
| [`2026-08-05-gallery-split-pane-workspace-handoff.md`](./2026-08-05-gallery-split-pane-workspace-handoff.md) | handoff | **SHIPPED** | 6854d7e845 |  |
| [`2026-08-06-gallery-library-shared-workspace-handoff.md`](./2026-08-06-gallery-library-shared-workspace-handoff.md) | handoff | **SHIPPED** | dd6af0d101 one workspace for gallery+library |  |
| [`2026-08-11-gallery-filter-pane-collapse-resize-design.md`](./2026-08-11-gallery-filter-pane-collapse-resize-design.md) | design | **SHIPPED** | efbf828de0 |  |

### browse  <sub>3 shipped, 3 in-flight, 3 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-21-browse-program-decommissioning-design.md`](./2026-08-21-browse-program-decommissioning-design.md) | design | **OPEN** | deferred irreversible gate; no commits | Only after every replacement behavior is proven |
| [`2026-08-21-following-and-performance-promotion-design.md`](./2026-08-21-following-and-performance-promotion-design.md) | design | **OPEN** | deferred decision spec; no commits | Decide creator vs collection following |
| [`2026-08-21-versioned-visual-artifact-publication-design.md`](./2026-08-21-versioned-visual-artifact-publication-design.md) | design | **OPEN** | no commits | Publish tunnels/mandalas/scenes without exposing private saves |
| [`2026-08-21-browse-explore-you-public-contributions-design.md`](./2026-08-21-browse-explore-you-public-contributions-design.md) | design | **IN-FLIGHT** | program charter; d3f2c97684 finished the route migration child | Several child specs still unstarted |
| [`2026-08-21-unified-performance-and-artwork-media-design.md`](./2026-08-21-unified-performance-and-artwork-media-design.md) | design | **IN-FLIGHT** | 77bc5d4c8e covers the subject-pinning half only | Extend the media record to artwork |
| [`2026-08-23-browse-phase-3-opus-handoff.md`](./2026-08-23-browse-phase-3-opus-handoff.md) | handoff | **IN-FLIGHT** | program continues past d3f2c97684; phase 3 tunnel slice not evidenced | Public tunnel vertical slice |
| [`2026-08-20-watch-retirement-and-performance-discovery-design.md`](./2026-08-20-watch-retirement-and-performance-discovery-design.md) | design | **SHIPPED** | c5d00d95fe + 8f1ed55352 | Native OTA still blocked by the Capgo plan |
| [`2026-08-21-browse-ia-and-route-migration-design.md`](./2026-08-21-browse-ia-and-route-migration-design.md) | design | **SHIPPED** | d3f2c97684 finish explore and you route migration |  |
| [`2026-08-21-media-authority-and-immutable-subjects-design.md`](./2026-08-21-media-authority-and-immutable-subjects-design.md) | design | **SHIPPED** | 77bc5d4c8e pin performances to immutable subject revisions |  |

### effects  <sub>7 shipped, 1 in-flight, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-06-effects-3d-instancing-handoff.md`](./2026-08-06-effects-3d-instancing-handoff.md) | handoff | **OPEN** | no matching commits; item 7 parity sweep unchecked | Run the real-viewer parity sweep |
| [`2026-08-06-effects-3d-full-roster-design.md`](./2026-08-06-effects-3d-full-roster-design.md) | design | **IN-FLIGHT** | b9af8f086a "update unfinished 3d roster handoff" | Finish the 16-effect 3D roster + native render parity |
| [`2026-08-05-goo-animal-2d-effects-handoff.md`](./2026-08-05-goo-animal-2d-effects-handoff.md) | handoff | **SHIPPED** | ad0d8b9751 |  |
| [`2026-08-11-ghost-3d-chrono-frost-design.md`](./2026-08-11-ghost-3d-chrono-frost-design.md) | design | **SHIPPED** | 15f918dd2d chrono-frost ghost poses |  |
| [`2026-08-11-silk-3d-effect-revival-handoff.md`](./2026-08-11-silk-3d-effect-revival-handoff.md) | handoff | **SHIPPED** | 7e478aacb0 kinetic silk ribbon surfaces |  |
| [`2026-08-13-3d-coal-effect-rebuild-design.md`](./2026-08-13-3d-coal-effect-rebuild-design.md) | design | **SHIPPED** | 7e4671ee5c rebuild coal/bloom/bubbles/ink |  |
| [`2026-08-14-effects-inspector-redesign.md`](./2026-08-14-effects-inspector-redesign.md) | design | **SHIPPED** | a35ade5fdd + 92d6698154 |  |
| [`2026-08-16-led-simulator-design.md`](./2026-08-16-led-simulator-design.md) | design | **SHIPPED** | 065a2a046a LED rebuilt as a physical prop simulator |  |
| [`2026-08-31-instant-3d-effect-activation-design.md`](./2026-08-31-instant-3d-effect-activation-design.md) | design | **SHIPPED** | 4e77117215 instant 3D effect activation |  |

### 3d props  <sub>7 shipped, 1 superseded</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-14-double-contact-ball-3d-rebuild-design.md`](./2026-08-14-double-contact-ball-3d-rebuild-design.md) | design | **SUPERSEDED** | self-marked; product direction moved to the contact-juggling viewer |  |
| [`2026-08-14-buugeng-3d-rebuild-design.md`](./2026-08-14-buugeng-3d-rebuild-design.md) | design | **SHIPPED** | 0a4cf1c9ea + 55f1b18758 rebuilt static/models/props/buugeng.glb |  |
| [`2026-08-14-chicken-3d-rebuild-design.md`](./2026-08-14-chicken-3d-rebuild-design.md) | design | **SHIPPED** | 0a4cf1c9ea + 8f259e8ccd "give the chicken a body, not a silhouette" |  |
| [`2026-08-14-guitar-3d-rebuild-design.md`](./2026-08-14-guitar-3d-rebuild-design.md) | design | **SHIPPED** | 0a4cf1c9ea + 55f1b18758 rebuilt static/models/props/guitar.glb |  |
| [`2026-08-14-trigeng-3d-rebuild-design.md`](./2026-08-14-trigeng-3d-rebuild-design.md) | design | **SHIPPED** | 0a4cf1c9ea + 55f1b18758 rebuilt static/models/props/trigeng.glb |  |
| [`2026-08-23-prop-studio-transition-completion-handoff.md`](./2026-08-23-prop-studio-transition-completion-handoff.md) | handoff | **SHIPPED** | 10071b1c3b shared motion owners for deck transitions |  |
| [`2026-08-25-buugeng-chirality-picker-design.md`](./2026-08-25-buugeng-chirality-picker-design.md) | design | **SHIPPED** | 0a9cd30a64 + 9bf5a7d331 chirality into rasterized pictographs |  |
| [`2026-09-03-moon-led-fan-handoff.md`](./2026-09-03-moon-led-fan-handoff.md) | handoff | **SHIPPED** | 051b256df0 + 5fa6106b1a polish |  |

### ghost presenter  <sub>4 shipped, 1 in-flight, 3 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-04-taco-cat-presence-design.md`](./2026-08-04-taco-cat-presence-design.md) | design | **OPEN** | self-marked "blocked on art" | Commission or generate the cat art |
| [`2026-08-05-ghost-presence-design.md`](./2026-08-05-ghost-presence-design.md) | design | **OPEN** | approved "full send" 08-05; no matching commit | Build always-on breathing + presence pass |
| [`2026-08-08-fable-ghost-intelligence-rating-handoff.md`](./2026-08-08-fable-ghost-intelligence-rating-handoff.md) | handoff | **OPEN** | 6cd8fa8b99 is the handoff itself; no rating recorded | Produce the rubric + rating, or retire the request |
| [`2026-08-06-ghost-understanding-design.md`](./2026-08-06-ghost-understanding-design.md) | design | **IN-FLIGHT** | shared/attract/domain has activities/activity-prediction/episodic-memory; annotations from e3e57ab7ad | Finish the app-model layer |
| [`2026-08-04-ghost-mind-design.md`](./2026-08-04-ghost-mind-design.md) | design | **SHIPPED** | 50a88c6754 tasks 0-5 | Task 6 (Taco Cat body) still blocked on art |
| [`2026-08-05-ghost-mind-handoff.md`](./2026-08-05-ghost-mind-handoff.md) | handoff | **SHIPPED** | 50a88c6754 + 31931e7eeb |  |
| [`2026-08-05-ghost-presenter-polish-handoff.md`](./2026-08-05-ghost-presenter-polish-handoff.md) | handoff | **SHIPPED** | ca21afa1f6 presenter stops repeating itself |  |
| [`2026-08-06-ghost-activity-intelligence-design.md`](./2026-08-06-ghost-activity-intelligence-design.md) | design | **SHIPPED** | 597cbed34e (self: implemented and verified) |  |

### learn  <sub>7 shipped, 1 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-09-04-hand-motions-timing-direction-followup-handoff.md`](./2026-09-04-hand-motions-timing-direction-followup-handoff.md) | handoff | **IN-FLIGHT** | branch codex/timing-direction-isolation; 4deccefb3f | Successor: 2026-09-05-timing-direction-hub-refinement.md |
| [`2026-08-23-learning-letters-fable-handoff.md`](./2026-08-23-learning-letters-fable-handoff.md) | handoff | **SHIPPED** | 41bab9b406 rebuild learning letters from the founding deck |  |
| [`2026-08-28-unified-learn-atlas-handoff.md`](./2026-08-28-unified-learn-atlas-handoff.md) | handoff | **SHIPPED** | three implementation commits merged as 38bdf03b22 | Governing design in specs/active |
| [`2026-09-03-pictograph-foundations-learning-sequence.md`](./2026-09-03-pictograph-foundations-learning-sequence.md) | design | **SHIPPED** | 1913778c1d teach pictograph foundations before letters |  |
| [`2026-09-04-guided-lesson-studio-visual-pass.md`](./2026-09-04-guided-lesson-studio-visual-pass.md) | design | **SHIPPED** | 275d498a93 restyle foundation lessons as guided studios |  |
| [`2026-09-04-timing-direction-article-cluster-design.md`](./2026-09-04-timing-direction-article-cluster-design.md) | design | **SHIPPED** | 7987e06b72 publish timing and direction article cluster |  |
| [`2026-09-05-timing-direction-hub-refinement.md`](./2026-09-05-timing-direction-hub-refinement.md) | design | **SHIPPED** | 7fde09396c merged codex/timing-hub-refinement |  |
| [`2026-09-05-timing-hub-native-controls.md`](./2026-09-05-timing-hub-native-controls.md) | design | **SHIPPED** | ab74f14a35 merged codex/timing-hub-native |  |

### 3d viewer  <sub>4 shipped, 2 in-flight, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-17-ocean-performer-command-bar-opus-test-handoff.md`](./2026-08-17-ocean-performer-command-bar-opus-test-handoff.md) | handoff | **OPEN** | 88842d17cf handoff only; no acceptance verdict recorded | Run the cold acceptance pass on /test/ocean-scene |
| [`2026-08-18-performer-hub-rethink-design.md`](./2026-08-18-performer-hub-rethink-design.md) | design | **IN-FLIGHT** | 92c0d260fe records a mid-execution ledger entry | Close the performer-hub rethink ledger |
| [`2026-08-30-performer-direct-manipulation-design.md`](./2026-08-30-performer-direct-manipulation-design.md) | design | **IN-FLIGHT** | branch codex/performer-direct-manipulation-2026 open; cf8efa40ce merged the first pass | Drag/touch/keyboard/undo remainder |
| [`2026-08-14-performer-command-bar-design.md`](./2026-08-14-performer-command-bar-design.md) | design | **SHIPPED** | 954f5c4a49 performer command bar |  |
| [`2026-08-23-adaptive-scene-control-workspace-handoff.md`](./2026-08-23-adaptive-scene-control-workspace-handoff.md) | handoff | **SHIPPED** | 21335f9da9 adaptive scene control workspace |  |
| [`2026-08-23-viewer3d-intro-presets-design.md`](./2026-08-23-viewer3d-intro-presets-design.md) | design | **SHIPPED** | d732cb06e5 first-open guided setup overlay |  |
| [`2026-09-04-multi-performer-selection-design.md`](./2026-09-04-multi-performer-selection-design.md) | design | **SHIPPED** | 9cfb5fb863 (self: implemented and verified) |  |

### notation  <sub>5 shipped, 1 open, 1 superseded</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-02-notation-caps-4k-density-correction.md`](./2026-08-02-notation-caps-4k-density-correction.md) | design | **OPEN** | PROPOSED, awaiting approval; no successor, no commits since | Approve or reject; 743-line spec is executor-ready |
| [`2026-07-18-notation-codex-audit-findings.md`](./2026-07-18-notation-codex-audit-findings.md) | audit | **SUPERSEDED** | self-marked "Superseded 2026-08-02" |  |
| [`2026-07-17-notation-roots-merge-design.md`](./2026-07-17-notation-roots-merge-design.md) | design | **SHIPPED** | d1438ada3c merged roots into /notation |  |
| [`2026-08-01-notation-caps-exhibit-redesign.md`](./2026-08-01-notation-caps-exhibit-redesign.md) | design | **SHIPPED** | 4ed2f41eaf bento hub; 08-02 doc calls it "the shipped 2026-08-01 implementation" |  |
| [`2026-08-02-fan-relation-lab-design.md`](./2026-08-02-fan-relation-lab-design.md) | design | **SHIPPED** | e5e7b7bc50 fan relations tab + big fan |  |
| [`2026-08-03-notation-fan-relations-handoff.md`](./2026-08-03-notation-fan-relations-handoff.md) | handoff | **SHIPPED** | e5e7b7bc50 + 7afacda1b6 |  |
| [`2026-08-23-notation-living-evidence-archive-handoff.md`](./2026-08-23-notation-living-evidence-archive-handoff.md) | handoff | **SHIPPED** | de10f5699a rebuild archive as evidence timeline |  |

### shape matrix  <sub>7 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-28-shape-matrix-app-design.md`](./2026-08-28-shape-matrix-app-design.md) | design | **SHIPPED** | 11638c4b6b standalone explorer app | Successors live in specs/active |
| [`2026-09-01-shape-matrix-animation-workspace-design.md`](./2026-09-01-shape-matrix-animation-workspace-design.md) | design | **SHIPPED** | dead6c994e + aa5e7ca17d; ledger 19/21 |  |
| [`2026-09-01-shape-matrix-animation-workspace-handoff.md`](./2026-09-01-shape-matrix-animation-workspace-handoff.md) | handoff | **SHIPPED** | same commits | Mobile continuity phase gated on Austen's approval |
| [`2026-09-02-shape-matrix-mandala-continuity-handoff.md`](./2026-09-02-shape-matrix-mandala-continuity-handoff.md) | handoff | **SHIPPED** | 58267744d0 then the parity branches |  |
| [`2026-09-02-shape-matrix-mandala-parity-design.md`](./2026-09-02-shape-matrix-mandala-parity-design.md) | design | **SHIPPED** | 68cbc2dba2 merged claude/shape-matrix-mandala-parity-4 |  |
| [`2026-09-04-shape-engine-ratio-guide-design.md`](./2026-09-04-shape-engine-ratio-guide-design.md) | design | **SHIPPED** | 4f8cd29463 ratio lineage guide |  |
| [`2026-09-04-shape-matrix-ratio-builder-design.md`](./2026-09-04-shape-matrix-ratio-builder-design.md) | design | **SHIPPED** | 51ad411248 merged codex/shape-matrix-ratio-builder |  |

### viewer  <sub>6 shipped, 1 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-09-01-sequence-viewer-transitions-handoff.md`](./2026-09-01-sequence-viewer-transitions-handoff.md) | handoff | **IN-FLIGHT** | gated program; last merges 08-30, gates continue one at a time | Next transition gate |
| [`2026-08-16-sequence-videos-consolidation-design.md`](./2026-08-16-sequence-videos-consolidation-design.md) | design | **SHIPPED** | 237548c249 route videos through sequenceVideos | Successor: specs/active/2026-08-28-sequence-route-consolidation-design.md |
| [`2026-08-16-step-map-editor-redesign-design.md`](./2026-08-16-step-map-editor-redesign-design.md) | design | **SHIPPED** | 82c70cf3bb step-map editor that composes |  |
| [`2026-08-16-video-notation-shared-playhead-design.md`](./2026-08-16-video-notation-shared-playhead-design.md) | design | **SHIPPED** | cb561ce21c one playhead for video + notation |  |
| [`2026-08-30-unified-viewer-custom-colors-design.md`](./2026-08-30-unified-viewer-custom-colors-design.md) | design | **SHIPPED** | 0bc07ad160 unify tunnel and mandala custom colors |  |
| [`2026-08-30-viewer-url-addressable-state-design.md`](./2026-08-30-viewer-url-addressable-state-design.md) | design | **SHIPPED** | ea2c3c5567 + f31032657a ledger ticks |  |
| [`2026-09-01-performance-two-pane-workspace-design.md`](./2026-09-01-performance-two-pane-workspace-design.md) | design | **SHIPPED** | 46a1007dc6 / 889bc92a87 |  |

### avatar/3d  <sub>6 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-29-avatar-cross-body-arm-routing-design.md`](./2026-08-29-avatar-cross-body-arm-routing-design.md) | design | **SHIPPED** | 65f029160f route crossed avatar arms anatomically |  |
| [`2026-08-30-avatar-face-clearance-design.md`](./2026-08-30-avatar-face-clearance-design.md) | design | **SHIPPED** | e68306011e + 452c0a5229 |  |
| [`2026-08-30-avatar-sequence-collision-audit-design.md`](./2026-08-30-avatar-sequence-collision-audit-design.md) | design | **SHIPPED** | 2cfc946c71 merged codex/avatar-collision-audit |  |
| [`2026-08-31-character-intake-pipeline-design.md`](./2026-08-31-character-intake-pipeline-design.md) | design | **SHIPPED** | 5ca22d9fbc character intake pipeline |  |
| [`2026-09-01-east-posture-staff-grip-handoff.md`](./2026-09-01-east-posture-staff-grip-handoff.md) | handoff | **SHIPPED** | 78775849dc merged codex/staff-grip-contact-lab |  |
| [`2026-09-03-human-stance-timing-design.md`](./2026-09-03-human-stance-timing-design.md) | design | **SHIPPED** | 831bcfe1b3 merged codex/stance-timing |  |

### backgrounds/autumn  <sub>5 shipped, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-09-autumn-asset-cohesion-plan.md`](./2026-08-09-autumn-asset-cohesion-plan.md) | plan | **OPEN** | matched commits all predate the plan | Confirm which cohesion items the later Autumn passes absorbed |
| [`2026-08-06-autumn-2d-opus-handoff.md`](./2026-08-06-autumn-2d-opus-handoff.md) | handoff | **SHIPPED** | be7e94f33c living autumn clearing authored |  |
| [`2026-08-06-autumn-living-forest-floor-handoff.md`](./2026-08-06-autumn-living-forest-floor-handoff.md) | handoff | **SHIPPED** | fb87cb0436 + 11f96140bf | Open follow-up: cabin-lane floor break reads as separate slabs |
| [`2026-08-10-autumn-delivery-contract.md`](./2026-08-10-autumn-delivery-contract.md) | design | **SHIPPED** | 2e4c6f13b4 + cb2029746b contract tests |  |
| [`2026-08-10-autumn-ground-treatment-plan.md`](./2026-08-10-autumn-ground-treatment-plan.md) | plan | **SHIPPED** | 48607143d1 ground treatment pass |  |
| [`2026-08-10-autumn-performance-plan.md`](./2026-08-10-autumn-performance-plan.md) | plan | **SHIPPED** | self "complete"; 97a419af64 closed the audit | Successor: specs/active/2026-09-01-autumn-performance-reliability.md |

### deck/shop  <sub>6 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-03-deck-insert-card-design.md`](./2026-08-03-deck-insert-card-design.md) | design | **SHIPPED** | 6862f90db6 (self-declared) |  |
| [`2026-08-04-deck-insert-card-handoff.md`](./2026-08-04-deck-insert-card-handoff.md) | handoff | **SHIPPED** | a37abcc08c |  |
| [`2026-08-05-shop-hero-rounds-handoff.md`](./2026-08-05-shop-hero-rounds-handoff.md) | handoff | **SHIPPED** | 1c3b8a24b5 rounds 10-13 |  |
| [`2026-08-11-festival-sample-pack-design.md`](./2026-08-11-festival-sample-pack-design.md) | design | **SHIPPED** | 39fd88629d print-ready sample pack |  |
| [`2026-08-12-festival-sample-pack-handoff.md`](./2026-08-12-festival-sample-pack-handoff.md) | handoff | **SHIPPED** | 39fd88629d + 46b68cbf4c |  |
| [`2026-09-04-tnd-hand-path-reference-cards-design.md`](./2026-09-04-tnd-hand-path-reference-cards-design.md) | design | **SHIPPED** | 4c2ae67829 hand-path reference deck released | TnD-volume integration still pending (branch codex/tnd-reference-links) |

### locomotion  <sub>3 shipped, 3 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-28-gait-timing-plan-experiment.md`](./2026-08-28-gait-timing-plan-experiment.md) | design | **OPEN** | 266a538a0c proposes it; experiment not run | Run the Walk Lab beat-authored gait experiment |
| [`2026-08-28-mocap-turnaround-plan.md`](./2026-08-28-mocap-turnaround-plan.md) | plan | **OPEN** | no commits | Author the out-and-back turnaround footwork |
| [`2026-08-28-stage-footfall-planning-handoff.md`](./2026-08-28-stage-footfall-planning-handoff.md) | handoff | **OPEN** | 8c568e78f0 + e09e54fdc9 are docs only | Wire Stage timeline direction to Walk Lab footfall plans |
| [`2026-08-27-exact-step-locomotion-design.md`](./2026-08-27-exact-step-locomotion-design.md) | design | **SHIPPED** | 672d2f8bd0 + 69cab25508 exact footsteps on score time |  |
| [`2026-08-28-grapevine-locomotion-design.md`](./2026-08-28-grapevine-locomotion-design.md) | design | **SHIPPED** | 97e3353575 + 1722db1aae authored rate |  |
| [`2026-09-03-locomotion-gait-tiers-design.md`](./2026-09-03-locomotion-gait-tiers-design.md) | design | **SHIPPED** | self "implemented on claude/locomotion-tiers" (branch merged) |  |

### combinator  <sub>1 shipped, 4 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-05-combinator-stage3-ui-handoff.md`](./2026-08-05-combinator-stage3-ui-handoff.md) | handoff | **OPEN** | no commits match stage 3 | Resume stage 3 + lab UI from the algebra handoff |
| [`2026-08-05-combinator-test-audit.md`](./2026-08-05-combinator-test-audit.md) | audit | **OPEN** | 41c2f94b04 audit only; verdicts depend on the unapproved redesign | Apply DELETE/KEEP verdicts once the redesign is approved |
| [`2026-08-05-sequence-combinator-algebra-handoff.md`](./2026-08-05-sequence-combinator-algebra-handoff.md) | handoff | **OPEN** | cfeca79852 handoff only | Pick up the 13 families / crossing law thread |
| [`2026-08-05-sequence-combinator-redesign-design.md`](./2026-08-05-sequence-combinator-redesign-design.md) | design | **OPEN** | "awaiting Austen's review"; supersedes the shipped-and-rejected 08-04 design | Approve or reject the LOOPs-only redesign |
| [`2026-08-04-sequence-combinator-design.md`](./2026-08-04-sequence-combinator-design.md) | design | **SHIPPED** | 475650e8e5 lab page; superseded by 08-05 redesign |  |

### museum  <sub>5 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-06-museum-one-walk-handoff.md`](./2026-08-06-museum-one-walk-handoff.md) | handoff | **SHIPPED** | 4a02c853ab + 4e10681253 one museum one walk |  |
| [`2026-08-11-museum-exhibit-hallway-architecture-design.md`](./2026-08-11-museum-exhibit-hallway-architecture-design.md) | design | **SHIPPED** | 182b1633b2 approved; e8108eb0e9 derived rooms from it | Governing museum canon — keep as reference |
| [`2026-08-11-museum-wings-phase0-canon.md`](./2026-08-11-museum-wings-phase0-canon.md) | design | **SHIPPED** | b3df681820 all six Phase 0 rows approved |  |
| [`2026-08-11-wing-declaration-shape-design.md`](./2026-08-11-wing-declaration-shape-design.md) | design | **SHIPPED** | eb7ff0e2d3 recorded as built; 4a544263f8 validator |  |
| [`2026-08-16-museum-pedestal-and-console-design.md`](./2026-08-16-museum-pedestal-and-console-design.md) | design | **SHIPPED** | 6eb293ba20 pedestals + a67f076c32 console in the Drowned Gallery | Roll the console out beyond Water |

### composer showcase  <sub>2 shipped, 1 in-flight, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-09-01-composer-showcase-range-design.md`](./2026-09-01-composer-showcase-range-design.md) | design | **OPEN** | no commit after 0437aeedb7 matches the range brief | Widen the Composer page beyond four beats |
| [`2026-08-21-composer-3d-showcase-film-design.md`](./2026-08-21-composer-3d-showcase-film-design.md) | design | **IN-FLIGHT** | 0437aeedb7 turned the public page into a live showcase | Successor: 2026-09-01-composer-showcase-range-design.md |
| [`2026-08-21-composer-presentation-mockup-handoff.md`](./2026-08-21-composer-presentation-mockup-handoff.md) | handoff | **SHIPPED** | 2c432e6d6e + 2ee83956aa | Successor: specs/shipped/2026-08-27-composer-presentation-promotion-plan.md |
| [`2026-08-23-composer-presentation-fable-handoff.md`](./2026-08-23-composer-presentation-fable-handoff.md) | handoff | **SHIPPED** | 8ec8a09c54 promote reviewed presentation |  |

### creators  <sub>3 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-23-creators-recent-work-presentation-intent-handoff.md`](./2026-08-23-creators-recent-work-presentation-intent-handoff.md) | handoff | **SHIPPED** | d1f7f29dc6 contract + 248c262fe1 previews render recorded intent |  |
| [`2026-08-23-public-preview-presentation-intent-design.md`](./2026-08-23-public-preview-presentation-intent-design.md) | design | **SHIPPED** | 248c262fe1 + cfbd01e91a opted-in hosts only |  |
| [`2026-08-25-community-map-invitation-design.md`](./2026-08-25-community-map-invitation-design.md) | design | **SHIPPED** | 9e748f2aad band + 8da56c8d52 full-page map opt-in |  |

### film director  <sub>3 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-21-3d-film-director-instrumentation-design.md`](./2026-08-21-3d-film-director-instrumentation-design.md) | design | **SHIPPED** | fddd4a9250 camera workbench + ~119 film-director commits | Phases 2 and 4 tracked separately |
| [`2026-08-23-film-director-directive-language-design.md`](./2026-08-23-film-director-directive-language-design.md) | design | **SHIPPED** | 94cb21d4e7 all 12 tasks ticked; f45e932013 |  |
| [`2026-08-23-film-director-fable-handoff.md`](./2026-08-23-film-director-fable-handoff.md) | handoff | **SHIPPED** | fddd4a9250 + the film-director commit stream |  |

### 3d/scene tooling  <sub>1 shipped, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-10-scene-composer-all-scenes-handoff.md`](./2026-08-10-scene-composer-all-scenes-handoff.md) | handoff | **OPEN** | c5f60c1f77 handoff only; no all-scene rollout commit | Finish select/place/move/save for every Scene Lab scene |
| [`2026-08-10-view-capture-design.md`](./2026-08-10-view-capture-design.md) | design | **SHIPPED** | 39c4a07b6e shared review capture |  |

### arrows/pictograph  <sub>2 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-13-canonical-arrow-placement-frame.md`](./2026-08-13-canonical-arrow-placement-frame.md) | design | **SHIPPED** | aaeaa08d45 canonicalize authored placement frames |  |
| [`2026-08-23-quarter-turn-arrow-visual-calibration-handoff.md`](./2026-08-23-quarter-turn-arrow-visual-calibration-handoff.md) | handoff | **SHIPPED** | ff5c33448c structural quarter-turn arrows |  |

### backgrounds/forest  <sub>2 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-08-canopy-forest-scene-handoff.md`](./2026-08-08-canopy-forest-scene-handoff.md) | handoff | **SHIPPED** | 87f22d4caa + ae037c3b74 lush ground and canopy |  |
| [`2026-08-16-forest-plantcatalog-install-and-proof-handoff.md`](./2026-08-16-forest-plantcatalog-install-and-proof-handoff.md) | handoff | **SHIPPED** | b6e2d9e39a two-tier PlantCatalog oak |  |

### contact lab  <sub>1 shipped, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-14-contact-lab-truth-sprint-handoff.md`](./2026-08-14-contact-lab-truth-sprint-handoff.md) | handoff | **OPEN** | self "parked 2026-08-14, feature commit none" | Decide: resume the truth sprint or archive it |
| [`2026-08-14-contact-juggling-viewer-design.md`](./2026-08-14-contact-juggling-viewer-design.md) | design | **SHIPPED** | 30244aa4bc dedicated contact juggling viewer | Practitioner review still pending |

### infra (non-app)  <sub>2 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-03-apollo-virtual-display-mesh-handoff.md`](./2026-08-03-apollo-virtual-display-mesh-handoff.md) | handoff | **SHIPPED** | all ledger items marked DONE |  |
| [`2026-08-04-laptop-apollo-client-handoff.md`](./2026-08-04-laptop-apollo-client-handoff.md) | handoff | **SHIPPED** | ef4c4cf36a |  |

### loop/generate  <sub>1 shipped, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-05-loop-detection-false-negatives-handoff.md`](./2026-08-05-loop-detection-false-negatives-handoff.md) | handoff | **OPEN** | 2757521d8a is the handoff only; no fix commit since | Fix nondeterministic detect_loop_pattern + false negatives |
| [`2026-08-04-loop-single-drilldown-design.md`](./2026-08-04-loop-single-drilldown-design.md) | design | **SHIPPED** | LOOPExpandedOverlay.svelte expands the selected card in place |  |

### pronunciation  <sub>2 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-16-pronunciation-corpus-design.md`](./2026-08-16-pronunciation-corpus-design.md) | design | **IN-FLIGHT** | cf268edb88 corpus to storage; 76f4631542 records partial state | Finish forced alignment + unit selection |
| [`2026-08-16-pronunciation-corpus-session-design.md`](./2026-08-16-pronunciation-corpus-session-design.md) | design | **IN-FLIGHT** | dd2c841619 pure domain for the hands-free session |  |

### third order  <sub>1 shipped, 1 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-09-04-third-order-motion-composition-architecture.md`](./2026-09-04-third-order-motion-composition-architecture.md) | design | **IN-FLIGHT** | branch codex/third-order-mandala-tracing; 4deb68853d locks the parity architecture | Prove parity, then migrate the Toy |
| [`2026-09-04-third-order-toy-design.md`](./2026-09-04-third-order-toy-design.md) | design | **SHIPPED** | 3be0ecb6ac + cac6eccc87 | Data/timing limits superseded by the architecture doc |

### tika  <sub>1 shipped, 1 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-09-04-tika-fable-handoff.md`](./2026-09-04-tika-fable-handoff.md) | handoff | **IN-FLIGHT** | b5cb2fb6df hardening; item 1 done except reduced-motion query | Finish reduced-motion + the parity programme |
| [`2026-09-05-tika-arrange-verb-design.md`](./2026-09-05-tika-arrange-verb-design.md) | design | **SHIPPED** | ef2a9a8e2e merged codex/tika-arrange-verb |  |

### tooling  <sub>2 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-01-agent-hub-renameall-design.md`](./2026-08-01-agent-hub-renameall-design.md) | design | **SHIPPED** | b8e847e51e renameall skill |  |
| [`2026-08-06-agent-hub-single-rename-design.md`](./2026-08-06-agent-hub-single-rename-design.md) | design | **SHIPPED** | fb514ba48f |  |

### tunnel  <sub>1 shipped, 1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-27-tunnel-editing-handoff.md`](./2026-08-27-tunnel-editing-handoff.md) | handoff | **OPEN** | no matching commits; handoff says nothing pushed | Finish tunnel editing identity |
| [`2026-08-23-tunnel-creator-phase-1-handoff.md`](./2026-08-23-tunnel-creator-phase-1-handoff.md) | handoff | **SHIPPED** | a37911afbd creator workspace; 19fc25a476 open saved tunnels |  |

### 3d perf  <sub>1 superseded</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-09-03-worker-renderer-scene-switch-prototype-design.md`](./2026-09-03-worker-renderer-scene-switch-prototype-design.md) | design | **SUPERSEDED** | self-marked; 2f47c0c7db persistent production worker replaced it |  |

### admin/analytics  <sub>1 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-04-session-triage-design.md`](./2026-08-04-session-triage-design.md) | design | **IN-FLIGHT** | server/analytics/session-triage-queries.ts + session-friction-score.ts exist; no admin route | Build the admin issue register surface |

### animation  <sub>1 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-04-animation-elemental-glyph-parity-design.md`](./2026-08-04-animation-elemental-glyph-parity-design.md) | design | **SHIPPED** | cdabccc7db elemental glyphs in playback+export |  |

### app shell  <sub>1 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-09-04-app-navigation-hierarchy-design.md`](./2026-09-04-app-navigation-hierarchy-design.md) | design | **SHIPPED** | a74267ceda unify app navigation hierarchy |  |

### backgrounds/blossom  <sub>1 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-23-blossom-scene-rebuild-handoff.md`](./2026-08-23-blossom-scene-rebuild-handoff.md) | handoff | **IN-FLIGHT** | branch+worktree codex/blossom-hanami-garden; 807f832723 built paths | Continue the hanami garden rebuild |

### backgrounds/celestial  <sub>1 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-11-olive-cloudbreak-revision-6-handoff.md`](./2026-08-11-olive-cloudbreak-revision-6-handoff.md) | handoff | **SHIPPED** | a7eb8b7bf6 seraphic vault cloudbreak revision |  |

### backgrounds/winter  <sub>1 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-08-winter-gate-3-opus-handoff.md`](./2026-08-08-winter-gate-3-opus-handoff.md) | handoff | **IN-FLIGHT** | 8879b17e89 handoff; governing plan is plans/active winter-environment-pass-three | Gate 3: replace the circular stage puck |

### engine/TKA  <sub>1 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-16-type-6-static-steps-design.md`](./2026-08-16-type-6-static-steps-design.md) | design | **SHIPPED** | 18bbd76594 a turn pattern builds static steps |  |

### learn/glossary  <sub>1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-23-glossary-codex-recovery-handoff.md`](./2026-08-23-glossary-codex-recovery-handoff.md) | handoff | **OPEN** | 1e6b57453e is the handoff itself; no recovery commits | Redo /glossary scope statement + vocabulary audit |

### onboarding  <sub>1 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-05-progressive-onboarding-and-account-setup-design.md`](./2026-08-05-progressive-onboarding-and-account-setup-design.md) | design | **SHIPPED** | d2e22a9ef5 progressive account setup | Onboarding remediation still tracked separately |

### post studio  <sub>1 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-16-post-studio-multi-pass-design.md`](./2026-08-16-post-studio-multi-pass-design.md) | design | **SHIPPED** | f865953271 multi-pass take folded into one card cycle |  |

### release  <sub>1 open</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-09-01-v0-40-release-writing-handoff.md`](./2026-09-01-v0-40-release-writing-handoff.md) | handoff | **OPEN** | 47769b4498 hands off context; no release notes commit | Write the v0.40.0 user-facing notes |

### seo/roots  <sub>1 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-31-visualspinner-software-page-handoff.md`](./2026-08-31-visualspinner-software-page-handoff.md) | handoff | **SHIPPED** | 6bf7b630fb merged codex/visualspinner-page-handoff |  |

### settings  <sub>1 shipped</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-23-notification-settings-responsive-polish-handoff.md`](./2026-08-23-notification-settings-responsive-polish-handoff.md) | handoff | **SHIPPED** | 00c3aee2ff polish delivery preferences across states |  |

### spiroanim  <sub>1 in-flight</sub>

| File | Type | Status | Evidence | Next action |
| --- | --- | --- | --- | --- |
| [`2026-08-30-spiroanim-tka-bridge-design.md`](./2026-08-30-spiroanim-tka-bridge-design.md) | design | **IN-FLIGHT** | 3e7663bd0f orientation translation; upstream PR still unmerged | Land the SpiroAnim-side PR |
