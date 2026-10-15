| Branch                               | Plain-language purpose                                                             | Verdict      | Confidence                                          | Revive effort |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ------------ | --------------------------------------------------- | ------------- |
| `codex/card-grid-handoff-wip`        | Keep the printed card readable while it moves between the viewer and video editor. | PARTLY       | Medium                                              | M             |
| `codex/construct-solo-authoring-wip` | Build one hand's path, then author its matching partner.                           | STILL-USEFUL | High for distinct source, medium for production fit | L             |
| `codex/led-shape-props-wip`          | Add segmented LED fans and illuminated triangle/triquetra props.                   | PARTLY       | High for gaps, medium for integration               | L             |
| `codex/option-raf-wip`               | Restart the small placement pulse without scheduling work for every glyph.         | STILL-USEFUL | High                                                | S             |
| `codex/picker-transitions-wip`       | Smooth fan choices and prop swaps, and replace six fan preview pictures.           | PARTLY       | Medium                                              | M             |

# Rescued WIP relevance, 2026-10-14

## Evidence boundaries and method

Observation: analysis pins local main to `b160410cacb926eb666f96e929b47eb17196a61d`; shared refs can advance during this swarm. Initial `git status --short` was empty and `git branch --show-current` returned `codex/swarm-wip-relevance`. Only this ledger is written. No other checkout, external tracker, browser, deployment or installed dependency is inspected or modified.

Observation: commands use `git show TIP:path`, `git diff MAIN...TIP`, `git log MAIN..TIP`, `git log MAIN -- path`, `git rev-list`, `git cat-file -e MAIN:path`, and targeted `rg` on this checkout. MAIN below means the pinned SHA. Commit dates quoted are `%cs` (committer date). Each branch has one unique commit, recorded below. Tables enumerate every net changed path, including binaries and branch-only additions.

Observation: **N** counts commits returned by `git rev-list --count --since=2026-09-07T00:00:00-05:00 MAIN -- PATH`, including merges and September 7 itself. This is path history, not line changes or proof the branch patch landed. Counts do not follow renames. Renamed destinations get separate counts. **Exists** is tested in the pinned main tree. A zero count on an absent addition means it never appeared at that exact main path within this window; a zero on an existing asset does not mean its contents match the WIP asset.

Inference: the last table column evaluates whether the branch's _behavioral intent_ still fits, not whether its old text patch applies. No application tests, builds, model renders, timing measurements or live product checks were run. Old handoff verification statements remain historical claims. Effort is relative: S = focused port, M = multiple cooperating owners, L = substantial reconciliation and acceptance work; these are not elapsed-time promises.

Observation: searches covered `docs/superpowers` specs, plans and handoffs, including active, shipped, archived and backlog folders (`rg --no-ignore`). No feature-abandonment REJECTED/superseded/parked decision was found for these five directions. Relevant actual scope decisions are quoted below. The “parked inspector” references describe UI state. The absence of a rejection is not proof of current product priority.

## Card grid handoff

Observation: tip `c5a088db34647eb54372d1ef80a0d37dc58b3ca0`, `2026-09-07`, `wip(sequence-viewer): stranded card layout handoff work` (10 paths).

Inference, purpose: Keep the card's printed arrangement intact while it moves between the large viewer and the small video-editor slot. Once the destination card is ready, fade away a temporary picture of the old arrangement instead of letting all its cells rearrange during the flight.

Observation: no handoff document is added by this branch. Its new `card-layout-handoff.ts` clones `.preview-stack`, copies selected computed styles, preserves decoded blob images with canvas pixels, fits the sheet as a unit, and waits for both readiness and landing before dissolving. It removes accessible identities from the inert copy and includes reversal, reduced-motion and cleanup handling. Its new test exercises sheet fitting and capture lifecycle; it is not a browser performance proof.

Observation: related intent and subsequent decisions live in `docs/superpowers/specs/active/2026-09-05-post-studio-shared-surfaces.md`. At line 204 it says: “The Card artwork and its approved animation were not changed.” Lines 249–251 state the later sizing fix: “now returns the grid picker to live container measurements. A collapsing viewer pane still holds its destination during motion. No column count is forced and the existing Card flight/reflow animation is unchanged.” This documents preservation of the existing animation; it does not explicitly reject a decorative sheet.

Observation: main commit `c19be1fa1c` (`2026-09-09`, `fix(card): release stale viewer geometry when returning to Studio`) contains the same substantive eight-line release of `motionContainerWidth/Height` as the WIP sizing change, plus direct/collapse regression cases. `9ee5ea2443` (`2026-09-08`, `fix(viewer): preserve canvas sharpness and scrubber flight order`) reworked the shared reparent owner. `bd1ffd6e89` (`2026-09-15`, `fix(viewer): keep the Card grid honest after the divider shrinks its pane`) addresses a later grid issue. `82ac064dc6` (`2026-10-08`, `perf(viewer): stop per-frame rebuilds during playback`) further changes sizing. The current reparent interface has `resize`, `returnAnchor`, `flightLayer`, `canDock`, but lacks the WIP's `prepareDestination` and `destinationFrame`. The sheet helper and its test remain absent.

Inference: **PARTLY**, medium confidence. The stale-size fix is superseded; the snapshot-sheet technique and additional geometry diagnostics remain distinct, but source alone does not establish that today's transitions still need them. Proposal: preserve `createCardLayoutHandoff` and `fitCardSheet` as a candidate for today's `ViewerCompanionSurface.svelte`, `ChoreoCard.svelte` readiness handling, and `reparent-to-inspector.ts`. Reconcile with the shared motion clock and existing dependent-surface docking; do not replace the current reparent owner wholesale. Effort **M** because readiness, reversal and image lifetime cross three owners and need visual/timing acceptance.

### Per-file evidence

Observation: existence and N are Git results. The final column is inference/proposal.

| Branch path                                                                                          | Exists on main / successor |   N | Applies in spirit today                                                                            |
| ---------------------------------------------------------------------------------------------------- | -------------------------- | --: | -------------------------------------------------------------------------------------------------- |
| `src/lib/shared/choreo-card/state/choreo-card-sizing-state.svelte.ts`                                | Yes                        |   3 | Superseded: same geometry release and stronger cases landed in c19be1fa1c.                         |
| `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte`                                        | Yes                        |  32 | Partial: integrate sheet readiness/flight hooks with current owners; preserve newer docking logic. |
| `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte`                            | Yes                        |  12 | Partial: integrate sheet readiness/flight hooks with current owners; preserve newer docking logic. |
| `src/lib/shared/sequence-viewer/components/card-layout-handoff.ts`                                   | No                         |   0 | Candidate: preserve sheet fitting, capture/cleanup logic or its regression cases.                  |
| `src/lib/shared/sequence-viewer/components/reparent-to-inspector.ts`                                 | Yes                        |   3 | Partial: integrate sheet readiness/flight hooks with current owners; preserve newer docking logic. |
| `src/routes/test/sequence-viewer-transitions/_components/SequenceViewerTransitionReviewFrame.svelte` | Yes                        |   5 | Candidate: add sheet/readiness/reversal trace to current review harness.                           |
| `src/routes/test/sequence-viewer-transitions/_components/TransitionGeometryTrace.svelte`             | Yes                        |   4 | Candidate: add sheet/readiness/reversal trace to current review harness.                           |
| `src/routes/test/sequence-viewer-transitions/transition-geometry-trace.ts`                           | Yes                        |   3 | Candidate: add sheet/readiness/reversal trace to current review harness.                           |
| `tests/unit/choreo-card/choreo-card-sizing-state.test.ts`                                            | Yes                        |   4 | Superseded: same geometry release and stronger cases landed in c19be1fa1c.                         |
| `tests/unit/sequence-viewer/card-layout-handoff.test.ts`                                             | No                         |   0 | Candidate: preserve sheet fitting, capture/cleanup logic or its regression cases.                  |

## Construct solo authoring

Observation: tip `49edfde7393adf80b4e81b09d99348099bd5344b`, `2026-09-07`, `wip(create): stranded solo authoring contract and components` (12 paths).

Inference, purpose: Let someone start with either hand and choose movements one at a time, with undo and redo. They can then write the other hand's path and combine both without silently losing steps.

Observation: the branch-only `src/routes/test/construct-solo-handoff/AUTHORING-CONTRACT.md` says: “This route is a functional, in-memory UX test. It does not replace Construct or write to its saved workspace.” It explicitly excludes interior-step replacement, skewed/centric placement, saved-path browsing, generation and production handoff. It reuses motion catalog projection, turn/orientation rules, `CommandStack`, canonical solo adapters and Fuse. New state/components add Diamond/Box starts, level/turn choices, active-hand path inspection, partner authoring, and cancellation of delayed catalog/letter work. `pairSoloReviewSequences` refuses unequal lengths/durations where the old harness uses `Math.min`.

Observation: current main's `/test/construct-solo-handoff/proposal/+page.svelte` still imports a fixed red review sequence, starts with an eight-step blue fixture and exposes `edit-blue`, `choose-red`, `paired`. Its editing flow uses fixture data. The new four authoring components/state file and contract/test are absent. Targeted searches of production Create found solo save handling but no `createSoloAuthoringState`, `New solo` or corresponding editor. This supports an unbuilt authoring gap; it is not a claim that solo storage/sharing is absent.

Observation: main's original harness came from `1d5d1bc34e` (`2026-09-04`, `feat(construct): prototype clear solo handoff flow`), then `bbaaaa4592` (`2026-09-04`, `fix(construct): clarify solo pairing walkthrough`) and `6842549765` (`2026-09-04`, `fix(construct): fit solo walkthrough on phones`). Later `48050b5010` (`2026-09-15`, `refactor(domain): rename the two-hand "position" concept to "placement"`) renamed start factories and wire fields; `aaa3c76d07` (`2026-09-27`, `fix(test-routes): keep every /test harness under the production guard`) replaced the reset layout. `a97b743f05` (`2026-10-10`, `feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`) changed imports. `d97f7d6270` (`2026-10-14`, `feat(foundation): solo-prop pair variations (stagger + per-hand reversal)`) adds pairing variation in the foundation layer.

Observation: `docs/superpowers/specs/active/2026-08-14-canonical-solo-prop-rendering-design.md` is related rendering architecture; filename/content searches found no later authoring cancellation or approval decision. Current `create-start-placement-data.ts` still does not copy `data.gridMode`, and the current adapter's `createStartPlacementData` call still omits the solo grid. The two small grid-preservation fixes remain candidates at their renamed owners.

Inference: **STILL-USEFUL**. Confidence high that the contract, UI state and silent-regression tests are distinct; medium that this precise UX remains the desired production design. Proposal: revive the contract and four authoring components/state in the current guarded test route first; port start-grid propagation to `src/lib/shared/create/factories/create-start-placement-data.ts` and the current solo adapter. Port continuation/pair validation and the six tests for Box preservation, turns, unequal pairing, delayed Undo, retry and async letter cancellation. Use current placement names, `#lib` imports and Fuse fidelity rules. Effort **L**: the branch itself excludes production persistence/handoff, and today's domain, route guard and fusion behavior need reconciliation before shipping.

### Per-file evidence

Observation: existence and N are Git results. The final column is inference/proposal.

| Branch path                                                             | Exists on main / successor                                                           |   N | Applies in spirit today                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --: | --------------------------------------------------------------------------------------------- |
| `src/lib/shared/create/factories/create-start-position-data.ts`         | No; successor `src/lib/shared/create/factories/create-start-placement-data.ts` (N=4) |   1 | Yes: propagate gridMode in renamed create-start-placement-data.ts.                            |
| `src/lib/shared/foundation/services/solo-prop-sequence-adapter.ts`      | Yes                                                                                  |   2 | Yes: pass solo grid to current start-placement factory call.                                  |
| `src/routes/test/construct-solo-handoff/+layout@.svelte`                | No; successor `src/routes/test/construct-solo-handoff/+layout.svelte` (N=1)          |   1 | No literal revival: preserve today’s guarded +layout.svelte / +layout.ts.                     |
| `src/routes/test/construct-solo-handoff/+page.svelte`                   | Yes                                                                                  |   1 | Yes: revive authoring prototype at this route with current placement names, imports and Fuse. |
| `src/routes/test/construct-solo-handoff/AUTHORING-CONTRACT.md`          | No                                                                                   |   0 | Yes: preserve scope and ownership contract as authoring prototype documentation.              |
| `src/routes/test/construct-solo-handoff/SoloMotionChoices.svelte`       | No                                                                                   |   0 | Yes: revive authoring prototype at this route with current placement names, imports and Fuse. |
| `src/routes/test/construct-solo-handoff/SoloPathPreview.svelte`         | No                                                                                   |   0 | Yes: revive authoring prototype at this route with current placement names, imports and Fuse. |
| `src/routes/test/construct-solo-handoff/SoloStartChoices.svelte`        | No                                                                                   |   0 | Yes: revive authoring prototype at this route with current placement names, imports and Fuse. |
| `src/routes/test/construct-solo-handoff/construct-solo-proposal.ts`     | Yes                                                                                  |   2 | Yes: revive authoring prototype at this route with current placement names, imports and Fuse. |
| `src/routes/test/construct-solo-handoff/proposal/+page.svelte`          | Yes                                                                                  |   2 | Yes: revive authoring prototype at this route with current placement names, imports and Fuse. |
| `src/routes/test/construct-solo-handoff/solo-authoring-state.svelte.ts` | No                                                                                   |   0 | Yes: revive authoring prototype at this route with current placement names, imports and Fuse. |
| `tests/unit/construct-solo-authoring.test.ts`                           | No                                                                                   |   0 | Yes: port six continuity, pairing and async Undo regression cases.                            |

## LED shape props

Observation: tip `f88f37f4041201b49ccc3beeadca10255dc1ffc2`, `2026-09-07`, `wip(3d): stranded LED shape prop pipeline work` (48 paths).

Inference, purpose: Keep the cloth-covered Moon fan and add a second fan with individually visible LED segments. Give triquetras and triangles believable illuminated tubing, with matching pictures and settings throughout the app.

Observation: branch-only `docs/superpowers/specs/2026-09-04-led-shape-props-handoff.md` names feedback `BQ1Wa0X53RrvE7bJ2ykS` and records the intended separate Moon/Astral builds, manufactured tubing, Triangle identity, codecs and cross-surface persistence. It claims previous tests/renders/builds, but also explicitly leaves source-comparison captures and production 16-count rotated LOOP seam captures unfinished. These claims have not been rerun here; the external feedback status is unverified.

Observation: Moon was already integrated before rescue, not a new September 7 gap: `docs/superpowers/specs/2026-09-03-moon-led-fan-handoff.md` names original `051b256df0`, realism `e456d98be8`, and integration `5fa6106b1a`. Current `build-for-effect.ts` still chooses `fanBuild: "moon"` for fan LEDs. `fan-appearance.ts` now lists pictograph/fire/flat-grip/lotus/day/moon/star, but no astral; `astral-fan-led-renderer-3d.ts`, `manufactured-shape-led-renderer-3d.ts`, `led-shapes.glb`, shape builder/verifier and their five previews remain absent. Current `packages/render-core/src/svg-color.ts:68` already lists Triangle for selective recoloring, introduced by the later Triangle work (`4f57c3e3a5`, 2026-09-18); its WIP recoloring change is therefore duplicated. The WIP renderer exports 30 blade + 36 rail emitter counts; those are branch implementation constants, not independently verified manufacturer facts.

Observation: Triangle subsequently arrived through a different design. `8997189270` (`2026-09-17`, `docs(props): triangle prop and mini hoop upgrade design spec`), `4f86c59c60` (`2026-09-17`, `feat(props): hoop family station table and geometry math`), `9fefc947d5` (`2026-09-18`, `feat(props): generate hoop family glyphs and geometry from the station table`), `4f57c3e3a5` (`2026-09-18`, `feat(props): register the triangle as a mini hoop variant`), and `e7db996d41` (`2026-09-18`, `feat(props): triangle grip appearance, render keys, boxes and tip points`) supply current identity/rendering. `51c6225f15` (`2026-09-27`, `feat(pictograph): draw the chosen triangle grip on pictographs and cards`) and `081a5c7e86` (`2026-10-05`, `fix: align triangle model grips and effect tips`) extend it further.

Observation: `docs/superpowers/specs/active/2026-09-17-triangle-hoop-family-design.md:41` chooses “Both corner and mid-side are real; grip is an appearance toggle”; line 45 chooses “One station table, generated 2D, procedural 3D in both renderers”; line 84 states “Day build only. No fire variant, no big variant.” This is a later scoped day-build design, not an explicit permanent rejection of LEDs. Its front matter still lists remaining family acceptance; source integration is established, full visual acceptance is not. Current Triangle artwork/registries and package patch therefore supersede the WIP's first Triangle identity/art/model dispatch implementation.

Inference: **PARTLY**, high confidence on duplicated Triangle work and missing Astral/manufactured LED owners; medium on model fidelity and integration fit. Proposal: preserve the Astral emitter renderer, fan builder/model delta, Astral SVG/preview and fan normalization tests; introduce them as another build in today's fan domain and scene package. Preserve manufactured shape tubing/model-generation and LED optical work as references for extending the current station/grip-based Triangle and current triquetras. Keep the model verifier and layout expectations as acceptance inputs, not proof of present correctness. Do not restore the old Triangle registry, codecs, placement artwork or aggregated package patch verbatim. Effort **L** because package patch, optics, both grip variants, settings/codecs, capture readiness and multi-surface proof must agree.

### Per-file evidence

Observation: existence and N are Git results. The final column is inference/proposal.

| Branch path                                                                   | Exists on main / successor |   N | Applies in spirit today                                                                            |
| ----------------------------------------------------------------------------- | -------------------------- | --: | -------------------------------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-09-04-led-shape-props-handoff.md`                | No                         |   0 | Yes: preserve requirements and unfinished visual/LOOP acceptance; recheck old status claims.       |
| `packages/render-core/src/svg-color.ts`                                       | Yes                        |   4 | Superseded: current selective-color list already includes Triangle; preserve newer color handling. |
| `packages/render-core/tests/svg-color.test.ts`                                | Yes                        |   0 | Superseded: current selective-color list already includes Triangle; preserve newer color handling. |
| `patches/@austencloud__scene-3d@0.1.6.patch`                                  | Yes                        |  43 | Rebuild dependency/package delta against current patch; never restore old aggregate.               |
| `pnpm-lock.yaml`                                                              | Yes                        |  70 | Rebuild dependency/package delta against current patch; never restore old aggregate.               |
| `scripts/build-fan-model.py`                                                  | Yes                        |   0 | Useful: Astral assembly delta and invariants; preserve existing Moon/fire/day builds.              |
| `scripts/build-led-shape-models.py`                                           | No                         |   0 | Useful: Astral/manufactured LED reference; adapt shapes to current grip/station model.             |
| `scripts/verify-fan-glb.cjs`                                                  | Yes                        |   0 | Useful: Astral assembly delta and invariants; preserve existing Moon/fire/day builds.              |
| `scripts/verify-led-shapes-glb.cjs`                                           | No                         |   0 | Useful: Astral/manufactured LED reference; adapt shapes to current grip/station model.             |
| `src/lib/shared/3d/components/controls/ScenePropPicker.svelte`                | Yes                        |   8 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/3d/domain/build-for-effect.ts`                                | Yes                        |   5 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/3d/domain/scene-prop-catalog.test.ts`                         | Yes                        |   2 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/3d/domain/scene-prop-catalog.ts`                              | Yes                        |   4 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/3d/domain/scene-prop-previews.test.ts`                        | Yes                        |   1 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/3d/effects/EffectOrchestrator3D.svelte`                       | Yes                        |   7 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/3d/effects/led/astral-fan-led-renderer-3d.ts`                 | No                         |   0 | Useful: Astral/manufactured LED reference; adapt shapes to current grip/station model.             |
| `src/lib/shared/3d/effects/led/manufactured-shape-led-renderer-3d.ts`         | No                         |   0 | Useful: Astral/manufactured LED reference; adapt shapes to current grip/station model.             |
| `src/lib/shared/3d/effects/prop-build-tip-geometry-3d.ts`                     | Yes                        |   5 | Partial: add LED-specific anchors while preserving current triangle grip tips.                     |
| `src/lib/shared/animation-engine/domain/types/prop-tip-points.ts`             | Yes                        |  16 | Partial: add LED-specific anchors while preserving current triangle grip tips.                     |
| `src/lib/shared/community/domain/profile-prop-catalog.ts`                     | Yes                        |   3 | Triangle identity/wiring superseded; retain current hoop family and codecs.                        |
| `src/lib/shared/gamification/domain/prop-pool.ts`                             | Yes                        |   1 | Triangle identity/wiring superseded; retain current hoop family and codecs.                        |
| `src/lib/shared/navigation/services/legacy-sequence-codec.ts`                 | Yes                        |   6 | Triangle identity/wiring superseded; retain current hoop family and codecs.                        |
| `src/lib/shared/navigation/services/sequence-encoder.ts`                      | Yes                        |  12 | Triangle identity/wiring superseded; retain current hoop family and codecs.                        |
| `src/lib/shared/pictograph/prop/domain/__tests__/fan-appearance.test.ts`      | Yes                        |   2 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/pictograph/prop/domain/enums/prop-classification.ts`          | Yes                        |   2 | Triangle identity/wiring superseded; retain current hoop family and codecs.                        |
| `src/lib/shared/pictograph/prop/domain/enums/prop-type.ts`                    | Yes                        |   4 | Triangle identity/wiring superseded; retain current hoop family and codecs.                        |
| `src/lib/shared/pictograph/prop/domain/fan-appearance.ts`                     | Yes                        |   7 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/pictograph/prop/domain/prop-type-display-registry.ts`         | Yes                        |   8 | Triangle identity/wiring superseded; retain current hoop family and codecs.                        |
| `src/lib/shared/render/core/constants/prop-classification.ts`                 | Yes                        |   5 | Triangle identity/wiring superseded; retain current hoop family and codecs.                        |
| `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte` | Yes                        |  27 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/settings/domain/app-settings.ts`                              | Yes                        |  11 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/lib/shared/settings/state/settings-state.svelte.ts`                      | Yes                        |  20 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `src/routes/test/prop-3d-studio/capture/+page.svelte`                         | Yes                        |   4 | Partial: add Astral/shape build controls to current capture route.                                 |
| `src/routes/test/prop-3d-studio/capture/CaptureScene.svelte`                  | Yes                        |   1 | Useful: current capture scene only updates readiness inside useTask; review the WIP mount reset.   |
| `static/images/props/animated/triangle.svg`                                   | Yes                        |   2 | Superseded base artwork by station/grip assets; LED preview concept remains separate.              |
| `static/images/props/appearances/fan-astral.svg`                              | No                         |   0 | Useful: Astral/manufactured LED reference; adapt shapes to current grip/station model.             |
| `static/images/props/build-previews/fan-astral-complete.webp`                 | No                         |   0 | Useful: Astral/manufactured LED reference; adapt shapes to current grip/station model.             |
| `static/images/props/build-previews/triangle-day.webp`                        | No                         |   0 | Superseded base artwork by station/grip assets; LED preview concept remains separate.              |
| `static/images/props/build-previews/triangle-led.webp`                        | No                         |   0 | Superseded base artwork by station/grip assets; LED preview concept remains separate.              |
| `static/images/props/build-previews/triquetra-day.webp`                       | No                         |   0 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `static/images/props/build-previews/triquetra-led.webp`                       | No                         |   0 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `static/images/props/buttons/triangle.svg`                                    | Yes                        |   2 | Superseded base artwork by station/grip assets; LED preview concept remains separate.              |
| `static/images/props/pictograph/triangle.svg`                                 | Yes                        |   2 | Superseded base artwork by station/grip assets; LED preview concept remains separate.              |
| `static/images/props/triangle.svg`                                            | No                         |   0 | Superseded base artwork by station/grip assets; LED preview concept remains separate.              |
| `static/models/props/fan.glb`                                                 | Yes                        |   0 | Useful: Astral assembly delta and invariants; preserve existing Moon/fire/day builds.              |
| `static/models/props/led-shapes.glb`                                          | No                         |   0 | Useful: Astral/manufactured LED reference; adapt shapes to current grip/station model.             |
| `tests/unit/3d-effects/build-for-effect.test.ts`                              | Yes                        |   1 | Partial: extend current owner for Astral/shape builds; Triangle base and Moon already exist.       |
| `tests/unit/3d-effects/manufactured-led-layouts.test.ts`                      | No                         |   0 | Useful: Astral/manufactured LED reference; adapt shapes to current grip/station model.             |

## Placement glyph pulse (option-raf)

Observation: tip `36a6f53cd5054ebd656a12f7599078a6eb9ba968`, `2026-09-07`, `wip(pictograph): stranded PositionGlyph work from the option-raf worktree` (one path).

Inference, purpose: Keep the little placement label pulsing when a beat changes. Restart the pulse directly instead of scheduling separate frame callbacks, timers and state changes for every label in a grid.

Observation: the sole diff replaces the CSS-class/reset-timer mechanism with `target.animate`, cancellation of the previous animation, unmount cleanup, and `motionDuration(PULSE_MS)` reduced-motion handling. It retains inner-group centering with `transform-box: fill-box` and `transform-origin: center`. Its comment claims 36 measured callbacks in an old production frame; the measurement is historical and has not been repeated here. No branch handoff document exists. `docs/superpowers/plans/2026-09-04-worktree-retirement-audit.md:86` mentions `option-raf` as a worktree, not a rejection or feature specification; the spec/plan search found no later decision about this pulse optimization.

Observation: `48050b5010` (`2026-09-15`, `refactor(domain): rename the two-hand "position" concept to "placement"`) renamed the component to `src/lib/shared/pictograph/shared/components/PlacementGlyph.svelte`. Later commits include `453be00df6` (`2026-09-25`, `fix(i18n): close German gaps across core user flows`), `a97b743f05` (`2026-10-10`, `feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`) and `7d1dfff785` (`2026-10-12`, `feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`). Despite those changes, current lines 190–220 still use `pulseTimeout`, `isAnimating`, `requestAnimationFrame`, then a reset timeout. This exact mechanism remains unported.

Inference: **STILL-USEFUL**, high confidence because the old scheduling pattern is directly visible in the renamed component. Proposal: port `playPulse`, animation cancellation and static SVG transform origin to `PlacementGlyph.svelte` using the current motion policy and import conventions. Validate rapid beat restarts, teardown, centering and reduced motion; no performance win is claimed until measured today. Effort **S**, one component and a bounded lifecycle change.

### Per-file evidence

Observation: existence and N are Git results. The final column is inference/proposal.

| Branch path                                                        | Exists on main / successor                                                              |   N | Applies in spirit today                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --: | ---------------------------------------------------------------------- |
| `src/lib/shared/pictograph/shared/components/PositionGlyph.svelte` | No; successor `src/lib/shared/pictograph/shared/components/PlacementGlyph.svelte` (N=4) |   1 | Yes: port pulse lifecycle to renamed PlacementGlyph; old name retired. |

## Fan picker transitions and previews

Observation: tip `e2efb215fd6f953fe1a6c64fc5fe526097434b40`, `2026-09-07`, `wip(props): stranded fan appearance picker and preview regeneration` (19 paths).

Inference, purpose: Make fan build and cover choices resize smoothly, and keep a prop centered when switching its artwork or size. Replace six fan thumbnails with consistent captures and record how each picture was made.

Observation: no new prose handoff is added. Six provenance JSON files specify the capture route, `1280x480@1` viewport, 640×240 Lanczos output, -12px vertical shift, fan model SHA256 `c366811930a43c28f30e6a1b1bd2054a817272d6f5c62b574f10e357046f19c1`, and recorded capture date `2026-09-06`. These capture records have not been reproduced here. The source diff adds `data-option-id`, bounded-picker fade-only reveals, animated cover-row height and card reflow; splits prop centering from transitioning placement; scales new artwork from its prior size; keeps a base tile selected for Big variants; and cache-busts replacement previews with `?v=2`.

Observation: related `docs/superpowers/specs/active/2026-08-30-shared-fan-appearance-2d-design.md:6` still says “remaining: Verify fan appearance normalization and asset resolution across 2D, Tunnel, 3D, and prop rails.” It names `Crossfade.svelte` as content-swap owner. No transition abandonment decision was found. Later main commits `8ca1f1ed27` (`2026-09-09`, `Simplify compact fan look picker`), `6fdf88675c` (`2026-09-09`, `Restore bounded fan look layout`) and `61b1d991a8` (`2026-09-18`, `feat(props): give the fan look picker room and a maker line`) reshape the fan picker. `c1db340e4a` (`2026-09-25`, `feat(composer): give prop selection a live preview workspace`) and `8d883cfe97` (`2026-10-06`, `feat(prop-picker): name prop versions V1 and V2`) further replace its surrounding selection structure. Current `BentoPropGrid.svelte` delegates picker content, so its old direct `PropTypeButton` selected-state patch has no corresponding insertion point there.

Observation: current `FanStyleOptions.svelte` still has bounded row calculation without the WIP's `cardMotion` or animated cover-row length; current `FanAppearancePicker.svelte` uses `growFade` for modifier blocks. Current `PropSvg.svelte` lacks `swapScale`, `centeringTransform` and the `.prop-artwork` group. `74eff7a000` (`2026-10-10`, `fix(pictograph): stop props spinning a full turn when motion playback ends`) changed that transform owner, so preserve its rotation correction when porting. The six WebP paths still exist, have zero commits since the cutoff, and differ from WIP blobs (checked below). No provenance file or `?v=2` change has landed at those paths.

Inference: **PARTLY**, medium confidence. The pictures/provenance and centered-swap technique remain distinct; bounded reveal behavior can still be useful, but the expanded fan catalog and redesigned picker mean old column-count and tile-selection code should not return wholesale. Proposal: compare/regenerate the six previews against today's fan model and retain validated provenance beside them; port centered artwork transforms into current `PropSvg.svelte`; adapt bounded fade/reflow to today's `FanStyleOptions`/`FanAppearancePicker` using the current motion clock. Inspect the active delegated family grid before proposing any Big-variant selection fix. Effort **M**, multiple visual owners plus preview validation; the old screenshots alone cannot establish a current defect.

### Per-file evidence

Observation: existence and N are Git results. The final column is inference/proposal.

| Branch path                                                                         | Exists on main / successor |   N | Applies in spirit today                                                                           |
| ----------------------------------------------------------------------------------- | -------------------------- | --: | ------------------------------------------------------------------------------------------------- |
| `src/lib/shared/3d/components/controls/PropBuildPicker.svelte`                      | Yes                        |   9 | Partial: adapt stable option IDs and bounded fade/reflow to today’s fan catalog/motion clock.     |
| `src/lib/shared/3d/domain/scene-prop-previews.test.ts`                              | Yes                        |   1 | Only with accepted replacement images: update URL version expectations consistently.              |
| `src/lib/shared/pictograph/prop/components/FanAppearancePicker.svelte`              | Yes                        |   6 | Partial: adapt stable option IDs and bounded fade/reflow to today’s fan catalog/motion clock.     |
| `src/lib/shared/pictograph/prop/components/PropSvg.svelte`                          | Yes                        |   5 | Yes in spirit: separate static centering and size morph; preserve newer rotation fix.             |
| `src/lib/shared/pictograph/prop/domain/fan-appearance.ts`                           | Yes                        |   7 | Only with accepted replacement images: update URL version expectations consistently.              |
| `src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte`            | Yes                        |  24 | Old tile code superseded by delegated picker; investigate selection in current grid owner.        |
| `src/lib/shared/settings/components/tabs/prop-type/FanStyleOptions.svelte`          | Yes                        |   1 | Partial: adapt stable option IDs and bounded fade/reflow to today’s fan catalog/motion clock.     |
| `static/images/props/build-previews/fan-day-black-bare-complete.provenance.json`    | No                         |   0 | Useful record; validate model hash/capture against current assets before copying.                 |
| `static/images/props/build-previews/fan-day-black-bare-complete.webp`               | Yes                        |   0 | Distinct replacement capture; compare/regenerate with provenance before replacing current images. |
| `static/images/props/build-previews/fan-day-black-covered-complete.provenance.json` | No                         |   0 | Useful record; validate model hash/capture against current assets before copying.                 |
| `static/images/props/build-previews/fan-day-black-covered-complete.webp`            | Yes                        |   0 | Distinct replacement capture; compare/regenerate with provenance before replacing current images. |
| `static/images/props/build-previews/fan-day-white-bare-complete.provenance.json`    | No                         |   0 | Useful record; validate model hash/capture against current assets before copying.                 |
| `static/images/props/build-previews/fan-day-white-bare-complete.webp`               | Yes                        |   0 | Distinct replacement capture; compare/regenerate with provenance before replacing current images. |
| `static/images/props/build-previews/fan-day-white-covered-complete.provenance.json` | No                         |   0 | Useful record; validate model hash/capture against current assets before copying.                 |
| `static/images/props/build-previews/fan-day-white-covered-complete.webp`            | Yes                        |   0 | Distinct replacement capture; compare/regenerate with provenance before replacing current images. |
| `static/images/props/build-previews/fan-fire-bare-complete.provenance.json`         | No                         |   0 | Useful record; validate model hash/capture against current assets before copying.                 |
| `static/images/props/build-previews/fan-fire-bare-complete.webp`                    | Yes                        |   0 | Distinct replacement capture; compare/regenerate with provenance before replacing current images. |
| `static/images/props/build-previews/fan-fire-covered-complete.provenance.json`      | No                         |   0 | Useful record; validate model hash/capture against current assets before copying.                 |
| `static/images/props/build-previews/fan-fire-covered-complete.webp`                 | Yes                        |   0 | Distinct replacement capture; compare/regenerate with provenance before replacing current images. |

## Asset comparison and coverage

Observation: `git rev-parse MAIN:path TIP:path` compares committed blob IDs without modifying files. Fan preview results:

| Asset basename                        | Main blob                                  | WIP blob                                   |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| `fan-day-black-bare-complete.webp`    | `8dd482dd128a74070784dbddcc8665386e2cce5a` | `f08d6174cd9268219c6ed32f76b63074fc2d0115` |
| `fan-day-black-covered-complete.webp` | `55bfa482e2c499d6c3bf489133014812c8be0e9e` | `204cd2266c0dba62b1dd6711b7e1f66fc0eb893e` |
| `fan-day-white-bare-complete.webp`    | `f585cd6ee07c43530357a4d1064a8f59c97c298f` | `7048ea7db7fa6548f866d8a6ccc7e3bd28d1179f` |
| `fan-day-white-covered-complete.webp` | `89ddb4f9c824a6843f2aa7923eb68387b676782e` | `ba350ea0314170fec43541abed76ea883e2ff526` |
| `fan-fire-bare-complete.webp`         | `28a56c296e61c126a8c0b61cd8a44c88694c4879` | `a8e6632e45927f54cea6aa63e0d4eca79dba6f34` |
| `fan-fire-covered-complete.webp`      | `3dfe95dc80816ec407c2e24d517e0cba24763cd5` | `a4f020cf0c4d2469cd0560e82b47d27391e6d7c6` |

Observation: coverage is 10 + 12 + 48 + 1 + 19 = **90 branch-path rows**, with shared files deliberately assessed separately for each branch. Nothing here establishes merge safety. No direction qualifies as DEAD from the evidence found, and none is entirely SUPERSEDED.

## Recommendations for Austen

**Card grid handoff, proposal: keep as a reference.** Drop the duplicate stale-size patch from any port plan. Revive the frozen-sheet portion only if a current Card/Studio round trip still visibly rearranges or blanks during travel; the existing approved animation deserves a direct comparison first.

**Solo authoring, proposal: revive the prototype.** It contains an editable one-hand flow that main's fixture walkthrough still lacks, plus useful protections against losing steps and stale async results. Keep it in the guarded test route until its product scope and production save/handoff are addressed.

**LED shape props, proposal: keep and selectively revive.** Astral and illuminated tubing are still missing. Keep their models, generators, renderers and acceptance notes; drop the obsolete first-pass Triangle identity/art wiring from the port, since main already has the newer two-grip hoop-family version.

**Option-raf, proposal: revive.** The same callback-and-timer pulse is still present in PlacementGlyph, so this is the smallest focused port. Check reduced motion and repeated pulses before claiming a performance improvement.

**Picker transitions, proposal: keep for selective porting.** Preserve the six capture records and centered-swap idea. Rework picker motion around today's expanded catalog and delegated grid, and compare the old replacement pictures before accepting them.

## Ledger verification

Observation: file-coverage validation passed for all five branches (10, 12, 48, 1, 19 rows) and all abbreviated cited commit references resolved with `git cat-file -e SHA^{commit}`. The ai-bust HIGH-severity scan initially flagged 12 contrast phrases; those were reworded. Its rerun reported `clean: no mechanical tells found`. Required report headings and repeated evidence labels follow the requested ledger contract.

Observation: the first supplemental Python read used the Windows default encoding and failed with `UnicodeDecodeError`; it was corrected to explicit UTF-8. Required delivery checks are `npx prettier --check docs/reports/swarm-2026-10-14/wip-relevance.md` and post-commit `git status --short`. Actual outcomes are reported in the worker's final message; no application verification is claimed by this document.
