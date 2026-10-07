---
status: active
value: 4
effort: M
remaining: "Reconcile each register family against the shipped 2026-07-02 absence-encoding design and current presence guards; record any uncovered behavior before marking this reference register complete."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Presence-as-Signal Register — StepData→Step Migration Gate

**Queue evidence (2026-10-07):** The separate `shipped/2026-07-02-stepdata-step-absence-encoding-design.md` records the required encoding and adoption slice as shipped; current `step-data.ts` declares `StepData extends Step`. The original encoding prerequisite is no longer outstanding. This register's individual sites have not been re-audited here, so its closeout remains unverified.

**Date:** 2026-07-01 · **Source:** 4-agent adversarial sweep (110 unique sites, deduped)
**Original status (historical):** BLOCKING INPUT for each adoption slice. The
absence encoding and initial adoption shipped on 2026-07-02; this register now
needs an entry-by-entry reconciliation before closeout.

## Why this exists

App `StepData.motions` is `Partial<Record<MotionColor, MotionData>>`; canonical `Step.motions`
is `{blue, red}` both-required. Every "is this motion present?" check becomes ALWAYS-TRUE after
adoption. The compiler cannot flag these — behavior changes silently. A prior version of this
list (~15 sites) lived only in a compacted workflow result and evaporated; this doc is the
durable register.

## Headline finding: absence encodes THREE distinct meanings

1. **Blank beat** — step exists, no motion authored yet (`isBlank` exists on canonical Step).
2. **One-hand assembly in progress** — user built one hand so far; renderer must not draw the other.
3. **Deliberately stripped solo view** — `prepare-mandala-club-sequence.ts:26` PRODUCES absence
   on purpose so downstream `if (motion)` guards skip the non-shown hand (mandala club solo
   animation). This is a shipped feature, not legacy tolerance.

Canonical `Step` cannot represent #2/#3 by omission. Before the hydrate-seam flip, the migration
needs an explicit absence encoding — candidates: `MotionView.isVisible=false` (render-side),
a per-hand presence flag on the view side-channel, or keeping partials at the VIEW layer only
while the engine layer stays both-required. That decision gates family A below.

## Guard tests

`tests/unit/presence-as-signal-guards.test.ts` locks current behavior for the family-B core
(identity/derivation) + representative A/C sites. Sites marked in that file break loudly when
their semantics change — the failing test is the checkpoint, not a bug.


## A. Solo / one-hand render path (absence is a FEATURE) — 29 sites

| conf | site | behavior when motion absent |
|---|---|---|
| HIGH | `shared/pictograph/arrow/orchestration/services/arrow-lifecycle-manager.ts:179` | The absent color gets no arrow state, so that hand renders without an arrow; additionally, if motions is an empty object, positions stays empty and allReady (line 210: Object.keys(positions).length > 0) stays false, leaving arrow state permanently not-ready in arrow-state.svelte.ts. |
| HIGH | `shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.ts:128` | calculateAllArrowPoints only iterates present colors, so no arrow location/position/mirroring is computed for the absent hand (used by inspect modal, example loader, and generate start-position selection). |
| HIGH | `shared/pictograph/shared/services/pictograph-preparer.ts:267` | getMotionsWithOverrides excludes the absent color, so the preparer computes no prop asset/position for that hand and the prepared pictograph renders one-handed. |
| HIGH | `shared/pictograph/shared/components/PictographRenderer.svelte:227` | Arrow-tip z-promotion (overlap detection between the two arrows) is disabled when only one motion is present; after migration this length gate always passes and only the downstream asset/position guards remain. |
| HIGH | `shared/pictograph/shared/components/PictographRenderer.svelte:214` | The absent motion is dropped from the derived render list, so no prop/arrow is drawn for that hand (one-hand pictograph); after migration both hands always render, gated only by visibleHand/opacity. |
| HIGH | `shared/3d/services/sequence-converter.ts:101` | deriveStartConfigFromStep emits null for the absent hand, so the derived static 3D start pose omits that prop entirely. |
| HIGH | `shared/3d/state/avatar-instance-state.svelte.ts:90` | Seamless-loopability: both absent → hand vacuously passes; asymmetric presence → sequence declared NOT loopable. Always-true means the orientation comparison always runs and the asymmetric-reject path is dead. |
| HIGH | `shared/animation-engine/components/layers/PathLinesOverlay.svelte:57` | That hand's path line is not drawn (null path → drawBlue/drawRed false → SVG path omitted); always-true draws a path for a fabricated motion. |
| HIGH | `shared/animation-engine/components/GlyphRenderer.svelte:56` | The animation glyph gets the static placeholder tuple "(s, 0, 0)" instead of the generated turns tuple for the step. |
| HIGH | `shared/pictograph/shared/components/PictographRenderer.svelte:297` | hasValidData=false is passed to TKA glyph, ReversalIndicators, ElementalGlyph, positions and DurationGlyph to suppress them on blank pictographs; always-true means glyphs render on previously-blank cells. |
| HIGH | `shared/pictograph/shared/components/PictographRenderer.svelte:285` | turnsTuple falls back to the "(0, 0)" placeholder instead of generating the real tuple, which changes DirectionDot / glyph rendering. |
| HIGH | `shared/pictograph/shared/components/PictographRenderer.svelte:186` | Same DIAMOND fallback in the live renderer's $derived gridMode; absence forces the diamond grid rather than deriving from motions. |
| HIGH | `shared/pictograph/shared/services/pictograph-preparer.ts:181` | Grid mode defaults to DIAMOND instead of being derived from motion locations, so a one-hand pictograph always renders on the diamond grid. |
| HIGH | `shared/browse/services/thumbnail-renderer.ts:160` | A startPosition missing either motion is treated as invalid and re-derived from the first beat before thumbnail render; always-true means broken start positions are never repaired. |
| HIGH | `shared/mandala/services/mandala-geometry-calculator.ts:445` | Per-hand path point generation skips beats where this hand has no motion, producing a shorter path with staff-angle chaining across the gap; always-true would insert fabricated segments. |
| HIGH | `shared/mandala/services/mandala-geometry-calculator.ts:638` | Motionless steps (start position / blanks) are filtered out of path geometry; empty result renders no paths. Always-true means blank steps start contributing path segments. |
| HIGH | `shared/mandala/services/mandala-path-preparer.ts:106` | Steps with no motions are excluded from the mandala step count; zero motion steps returns null and no mandala is rendered at all. |
| HIGH | `shared/animation-engine/services/prop-interpolator.ts:221` | calculateInitialAngles returns invalid/null per hand, so the initial pose leaves the missing hand's prop at fallback state instead of positioning it from step data. |
| HIGH | `shared/animation-engine/services/frame-parameter-builder.ts:509` | updateHandPresenceCache sets sequenceHasBlueMotion/sequenceHasRedMotion=false for a hand with no motion anywhere, which nulls that hand's prop so the renderer draws only one prop during single-hand assembly; always-true means both props always draw. |
| HIGH | `shared/3d/services/sequence-converter.ts:69` | An absent motion yields a null config so no 3D prop is created for that hand in the viewer; after migration both props always spawn (subject only to isVisible). |
| HIGH | `features/lab/vtg-lab/services/prepare-mandala-club-sequence.ts:26` | PRODUCER of absence-as-signal: strips the non-shown hand to undefined in startPosition and every step so downstream `if (redMotion)` guards skip it (solo animation). Canonical Step with required {blue,red} cannot represent this; the always-true checks would render the stripped hand. |
| HIGH | `shared/animation-engine/services/prop-interpolator.ts:67` | An absent hand keeps angles null, so that prop renders nothing (no prop, no endpoints, no path line) — the engine's genuine one-hand/solo path that mandala club animations deliberately rely on; after migration the stripped hand would render. |
| HIGH | `shared/animation-engine/services/prop-interpolator.ts:57` | Both hands absent yields isValid:false, so the animation frame is treated as blank and nothing animates for that step; after migration this branch is dead and every step animates. |
| med | `shared/pictograph/option/OptionPictograph.svelte:55` | Same activeLocations pattern as PictographContainer for option-picker pictographs - absent hand adds no grid highlight. |
| med | `shared/render/services/layer-compositor.ts:565` | In handPointVisibility="active" mode, an absent hand contributes no highlighted grid points; always-true highlights points from fabricated motions. |
| med | `shared/pictograph/prop/services/prop-placer.ts:161` | Beta-position prop separation offset is skipped (props left unseparated at {0,0} offset) when either motion is absent, even after endsWithBeta returned true; after migration the beta offset computes from synthesized motions. |
| med | `shared/pictograph/shared/components/PictographRenderer.svelte:231` | Arrow tip z-promotion is disabled unless both blue and red motion entries exist in the rendered motions array; after migration (two entries always present barring visibility filtering) tip promotion can newly activate on formerly one-hand pictographs. |
| med | `shared/pictograph/shared/components/PictographContainer.svelte:296` | An absent motion contributes no entry to activeLocations, so hand-point highlighting on the grid marks only the present hand's location; after migration both hands' end locations always highlight. |
| med | `shared/render/services/web-gl-direct-renderer.ts:378` | An absent motion means that hand's arrow is simply not drawn (one-arrow pictograph); after migration both arrows always draw subject only to visibility flags. |

## B. Identity & derivation gates (silent data corruption tier) — 32 sites

| conf | site | behavior when motion absent |
|---|---|---|
| HIGH | `shared/pictograph/arrow/positioning/key-generation/services/special-placement-ori-key-generator.ts:16` | generateOrientationKey returns the fallback ori key "in_in" instead of the real orientation pair, so special placement adjustments resolve from the wrong orientation bucket. |
| HIGH | `shared/create/services/start-position-transforms.ts:190` | rotateStartPosition keeps the old gridPosition (initialized at line 186) and derives the letter from that stale position instead of recomputing from the rotated motion locations. |
| HIGH | `shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator.ts:47` | Falls back to the generic "(0, 0)" tuple instead of the letter-type-specific tuple; the tuple keys glyph caches and special-placement adjustment lookups, so absence reroutes those lookups to the fallback bucket. |
| HIGH | `shared/foundation/services/sequence-decomposer.ts:130` | Solo-prop decomposition substitutes a static placeholder step for the missing hand (comment: possible in blank beats) so the factory doesn't throw; always-true converts the fabricated motion instead, changing solo-prop hashes. |
| HIGH | `features/choreo-card/services/reversal-seed-service.ts:120` | After flipping motions for a reversal variant, the step letter is only re-derived from the CSV when both motions exist; absence leaves the stale letter in place. |
| HIGH | `features/create/shared/services/sequence-extender.ts:366` | deriveLetterForStep returns null so a LOOP-transformed step missing a hand keeps no letter; always-true runs the dataframe lookup against fabricated motions. |
| HIGH | `features/choreo-card/services/deck-variation.ts:397` | loopCloses treats a hand with a missing first/last motion as vacuously closed (permissive), allowing deck variations; always-true replaces that with a real orientation comparison that may now reject. |
| HIGH | `features/choreo-card/services/loop-explainer.ts:420` | checkInverted skips hands with an absent motion; a pair that would have failed inversion is silently ignored, changing the printed LOOP explanation. |
| HIGH | `features/choreo-card/services/loop-explainer.ts:383` | checkSwapped for printed card text only counts fully-present pairs; absence shrinks checkCount and can flip the exact-match verdict that drives card copy. |
| HIGH | `shared/create/services/loop-detector.ts:421` | detectsInversion skips per-hand comparisons when either motion is absent (neither passes nor fails); always-true makes fabricated motions able to veto or confirm inversion. |
| HIGH | `shared/navigation/services/sequence-hydrator.ts:92` | QR-decode hydration scans for the first beat whose motions decoded cleanly (comment: beat 0 may be a blank placeholder with no motions); absence keeps scanning, none found leaves gridMode unset. Always-true makes beat 0 always win. |
| HIGH | `shared/pictograph/shared/domain/utils/tnd-deriver.ts:114` | TnD classification returns NULL_RESULT (no tndMode / elementalType) when either motion is absent — feeds card footers and gallery taxonomy; after migration synthesized motions can produce a classification for previously unclassified pictographs. |
| HIGH | `shared/foundation/services/sequence-hydrator.ts:112` | Hydration-time gate: when the first step lacks either motion, deriveStartPositionFromSteps returns undefined and the hydrated sequence carries no renderable start cell; after migration a start cell is always synthesized. |
| HIGH | `shared/pictograph/shared/services/start-position-deriver.ts:21` | The throw is caught by getOrDeriveStartPosition (line 102-104) which returns null — the sequence gets NO derived start position; after migration derivation always succeeds and formerly start-position-less sequences gain a synthesized start cell. |
| HIGH | `shared/comparison/services/sequence-equivalence-detector.ts:239` | Any step missing a motion makes the whole pair of sequences 'not identical'; after migration comparison proceeds on synthesized motions, so previously non-equivalent sequence pairs can silently become equivalent (dedup/equivalence behavior change). |
| HIGH | `shared/create/services/sequence-transforms.ts:551` | deriveSequenceLetters keeps the step's existing letter when either motion is absent; after migration the letter lookup runs on synthesized motions and can rewrite letters (and thus the sequence word) for formerly one-hand steps. |
| HIGH | `features/compose/services/sequence-loopability-checker.ts:92` | Verbatim duplicate of the foundation loopability checker: absent hands vacuously pass the per-hand circularity checks, both-absent means not circular. Same migration risk in the compose feature's copy. |
| HIGH | `shared/foundation/services/sequence-loopability-checker.ts:92` | Circularity is judged only on hands that have data: a one-handed sequence is loopable if the present hand matches (absent hand vacuously passes, incl. orientation check at 142/147); both hands absent means 'not circular'. After migration synthesized motions must also match, which can flip loopable verdicts. |
| HIGH | `shared/create/services/sequence-derived-fields.ts:34` | reconcileStepDerived passes blank/single-hand steps through unchanged (comment says so explicitly) — gridMode, startPosition, endPosition are NOT recomputed; after migration derivation runs and overwrites those fields on formerly one-hand steps. |
| med | `shared/domain/curriculum/level-feature-detector.ts:100` | The absent hand contributes zero level features, so detectLevelFeatures can report a lower minLevel/beyondLevel3, which catalog-membership.ts uses to gate choreo-card catalog inclusion; medium because a behavior change only materializes if the now-required motion carries level-triggering data (center locations, hash motion types, interradial orientations, skew). |
| med | `shared/foundation/services/content-hasher.ts:113` | An absent motion hashes as the "-" sentinel; post-migration the same sequence hashes differently, invalidating render caches keyed by hashSequenceContent and any persisted fingerprint comparisons for one-hand/blank-step sequences. |
| med | `shared/navigation/services/sequence-encoder.ts:348` | The encode/decode parity differ reports 'motion missing' as a round-trip mismatch; always-true retires this failure mode and shifts detection onto field comparisons of fabricated motions. |
| med | `features/compose/services/sequence-loopability-checker.ts:142` | Byte-for-byte duplicate of the foundation loopability checker with the same vacuous-pass-when-absent semantics; both copies need the same guard test. |
| med | `shared/foundation/services/sequence-loopability-checker.ts:142` | Orientation-circularity vacuously passes for a hand whose last-step motion is absent; always-true means the comparison always runs and previously-'circular' one-hand sequences can flip to non-circular. |
| med | `shared/navigation/services/sequence-encoder.ts:430` | URL/QR decode chains orientation per hand only when the decoded motion exists: a blank-hand beat carries the previous orientation forward, and isBlank derives from both segments being empty; decode also constructs StepData with possibly-undefined motions, which the canonical required {blue,red} shape cannot represent. |
| med | `shared/create/services/start-position-transforms.ts:59` | deriveGridPositionFromMotions falls back to the stored gridPosition instead of deriving from motion locations when either motion is absent (same guard shape at line 190); after migration the derived value always wins over the stored one. |
| med | `shared/create/domain/detect-rotation-period.ts:12` | derivePosition returns null so the quarter-position check at line 41 fails and the rotation period stays 2 instead of 4 (cached per sequence id); after migration synthesized locations could newly qualify a sequence as period-4. |
| med | `shared/comparison/services/similarity-calculator.ts:408` | An absent motion is counted as a MISMATCH (else branch), directly lowering the similarity score between sequences (same pattern at 414, 499, 502); after migration synthesized motions can match and raise similarity scores. |
| med | `shared/create/services/loop-detector.ts:366` | Swap-pattern detection only counts pairs where all four motions exist (inversion detection at 421/433 likewise skips comparisons); absent motions reduce checkCount/validComparisons and can flip the detected LOOP type. After migration every pair is counted. |
| med | `shared/create/services/loop-detector.ts:55` | deriveStartPosition/deriveEndPosition (line 78) return null when either motion is absent, so LOOP detection cannot establish positions and classifies the sequence differently (non-circular / no LOOP type); after migration positions derive from synthesized motions. |
| med | `shared/browse/services/sequence-difficulty-calculator.ts:30` | Steps with no motions object contribute nothing to the browse difficulty level (turns / non-radial detection skipped); after migration every step is analyzed — a bridge-synthesized motion pair with turns or non-radial orientation would silently raise a sequence's difficulty badge. Medium: helpers likely no-op on default motions, but that depends on what the bridge synthesizes. |
| med | `shared/create/services/sequence-derived-fields.ts:81` | Steps missing either motion are skipped when choosing the 'first real' step that donates the sequence-level gridMode; after migration every non-blank step qualifies, potentially changing which gridMode wins. |

## C. Loader / playback orchestration gates — 18 sites

| conf | site | behavior when motion absent |
|---|---|---|
| HIGH | `shared/animation-engine/services/sequence-animation-orchestrator.ts:648` | calculateStartPositionState (mirrored at line 194 in calculateState) skips updating prop angles entirely when the first step has no motions, leaving props at their reset pose at start position; always-true runs calculateInitialAngles on a blank step's placeholder motions and snaps props to wherever those point. |
| HIGH | `shared/sequence-viewer/services/sequence-motion-loader.ts:15` | Hydration gate: when no step has both motions, fetches the full sequence from the gallery via getBrowseLoader().loadFullSequenceData and returns it (line 25 re-checks the same presence predicate to accept the fetched result); always-true means thin sequences are returned unhydrated and playback runs on placeholder motions. |
| HIGH | `shared/animation-engine/services/sequence-animation-orchestrator.ts:194` | At start position, prop angles are only derived from the first step when it has any motion; absence leaves prop states untouched (fallback pose). |
| HIGH | `shared/animation-engine/services/sequence-animation-orchestrator.ts:410` | findFirstBeatWithMotion skips motionless leading steps to pick the beat that seeds the initial prop pose; always-true means steps[0] is always used even if it was a blank beat. |
| HIGH | `features/lab/effects-lab/components/EffectsLabPlaybackHost.svelte:288` | Same hydration gate for effects-lab playback: absence fetches the full sequence before initializing the playback controller. |
| HIGH | `features/create/shared/components/coordinators/SequenceDrawerHost.svelte:375` | Same hydration gate in the Create drawer: absence triggers gallery hydration before viewer playback; presence returns the sequence as-is. |
| HIGH | `features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte:279` | Same hydration gate: absence routes to sequenceService.getSequence(identifier) to load full motion data for the inline browse player. |
| HIGH | `shared/coordinators/AnimationSheetCoordinator.svelte:406` | loadSequenceData() only fetches full data from gallery when this is false; always-true means the animation panel initializes playback on a sequence that never got its motions loaded. |
| HIGH | `shared/sequence-viewer/services/sequence-data-provider.ts:32` | hasMotionData() false gates prefetch hydration of gallery sequences; absence means loadFullSequenceData is called and cached, presence short-circuits to the lightweight object. |
| HIGH | `shared/sequence-viewer/services/sequence-motion-loader.ts:16` | Absence of both motions on every step marks the sequence 'lightweight' and triggers a gallery fetch of the full sequence data before animation; always-true means hydration is silently skipped and playback runs on partial data. |
| med | `features/choreo-card/services/catalog-loader.ts:39` | hydrateMotions only synthesizes defaults (arrowPlacementData, propPlacementData) for present motions, so the absent hand stays absent through catalog hydration and downstream card rendering sees a one-hand step; medium because it gates hydration rather than branching, and post-migration behavior depends on what the canonical bridge fills in. |
| med | `features/lab/phrase-effort-lab/PhraseEffortLabModule.svelte:251` | Playback tick early-returns for a blank step, freezing lab.currentStepData/prop states; always-true updates them from fabricated motions. |
| med | `features/create/shared/workspace-panel/sequence-display/services/step-cell-animation-manager.ts:21` | The pictograph signature encodes hand presence (B/R) for structural-change detection; absence-to-presence transitions currently retrigger the cell bloom animation, and always-"BR" changes when cells re-animate. |
| med | `features/landing/services/endless-spinner-orchestrator.ts:410` | deriveBeatEndPosition returns null so the spinner cannot match a follow-up sequence to this beat's end state; endLocation half survives migration. |
| med | `shared/animation-engine/services/sequence-chaining-orchestrator.ts:288` | Looks like a ?? default but the null is consumed downstream: endless-spinner-orchestrator (line 522-526) only performs start-orientation adjustment when both target orientations are non-null, so absence disables orientation matching during sequence chaining. |
| med | `shared/animation-engine/services/animation-render-loop.ts:905` | The render loop passes a null turns tuple for glyph rendering when either motion is missing; always-true renders a tuple built from fabricated turns. |
| med | `shared/animation-engine/services/frame-builder.ts:26` | calculateTurnsTuple returns the "(s, 0, 0)" placeholder instead of invoking the tuple generator, changing the frame's glyph parameters. |
| med | `features/landing/services/endless-spinner-orchestrator.ts:605` | deriveSequenceGridMode skips start-position/step candidates missing either motion when hunting for the authoritative gridMode donor; after migration the first candidate always qualifies, potentially changing the derived grid mode for landing-spinner sequences. |

## D. Editing / UX / lab gates — 31 sites

| conf | site | behavior when motion absent |
|---|---|---|
| HIGH | `features/create/shared/components/sequence-actions/rotation-direction/SaveModePanel.svelte:41` | The pattern preview distinguishes 'none' (motion present, no rotation) from null (no motion at all) per beat; always-true collapses null into 'none' and the no-motion display state disappears. |
| HIGH | `features/create/shared/services/rotation-direction-pattern-manager.ts:143` | Rotation-direction pattern application silently skips a hand whose motion is absent, exactly mirroring turn-pattern-manager. |
| HIGH | `shared/create/services/turn-pattern-manager.ts:176` | Forward orientation propagation (endOrientation → next startOrientation) is skipped across beats where either side lacks the motion; always-true propagates through fabricated motions. |
| HIGH | `shared/create/services/turn-pattern-manager.ts:121` | Applying a turn pattern silently skips a hand whose motion is absent on that beat; always-true applies turns to fabricated motions. |
| HIGH | `features/create/shared/services/step-operations/orientation-handler.ts:236` | Orientation propagation STOPS at the first beat missing the color's motion (or the motions object), leaving all later beats with stale orientations; after migration propagation runs through the whole sequence, recomputing orientations past formerly blank/one-hand beats. |
| med | `features/choreo-card/components/card-back/card-back-data.ts:368` | deriveTnDRatio ignores the absent hand's turns in the uniformity check: a missing hand can hide mixed turns that would otherwise nullify the ratio, and if no numeric turns exist at all it returns "1:1"; after migration the always-present motion's turns join the check and can flip the ratio label or null it. |
| med | `features/choreo-card/components/card-back/card-back-data.ts:174` | deriveAnatomy (same pattern at line 164 for the start position) omits the absent hand's motion type, rotation direction, orientations, and turns from the card-back anatomy sets, changing what the printed card displays; medium because it is display content derived from a completeness scan. |
| med | `features/create/construct/option-picker/services/reversal-checker.ts:42` | The absent motion contributes 0 to the intrinsic reversal count, so the option can classify as reversal-free in option-picker filtering/badging; medium because a post-migration static motion usually still scores 0 — the change surfaces only for motions with pro/anti mixes or turns > 1. |
| med | `features/levels/poi-lab/services/vtg-terminology-mapper.ts:17` | deriveVTGTerminology returns null so the poi lab shows no VTG timing/direction mapping for the pictograph; always-true derives terminology from fabricated motions. |
| med | `features/levels/poi-lab/services/poi-sequence-validator.ts:29` | Hands with no motion are never validated, so the sequence reports isValid with zero violations for them; presence turns on validation. |
| med | `features/levels/poi-lab/services/poi-option-filter-decorator.ts:22` | An absent motion is 'not poi' so the option passes the poi-legality filter unvalidated; a fabricated motion with a poi propType would now be validated (and possibly rejected). |
| med | `features/create/shared/domain/transforms/pictograph-example-loader.ts:226` | loadAllPictographs drops dataset entries lacking both motions as invalid; always-true stops filtering and invalid entries reach the letter-matching cache. |
| med | `features/create/shared/domain/transforms/pictograph-example-loader.ts:176` | filterForTransform excludes pictographs missing either motion from transform demo candidates; always-true admits them into mirror/flip/invert demos. |
| med | `features/create/shared/domain/transforms/pictograph-example-loader.ts:142` | reclassifyLetter skips the dataframe letter lookup and returns the pictograph unchanged after a transform. (PictographData site - confirm whether it rides the StepData migration.) |
| med | `features/create/shared/components/sequence-actions/StepEditorPanel.svelte:278` | isBetaPosition is false for one-hand steps, disabling the B-key beta-swap toggle; always-true shifts the gate entirely onto the endLocation equality of fabricated motions. |
| med | `features/create/shared/components/arrow-adjustment/ArrowLayerModal.svelte:56` | selectedArrowContext null disables the arrow layer modal's adjustment context for that color, same family as PipelineEditorDock. |
| med | `features/create/shared/components/sequence-actions/pictograph-inspect/PipelineEditorDock.svelte:92` | selectedArrowContext/arrowLocation/specialOverrideKey resolve to null so the arrow-adjustment dock is inert for a color with no motion; always-true enables editing fabricated motions. |
| med | `features/write/services/sheet-continuity.ts:29` | undefined orientation participates in statesMatch equality that drives choreo-sheet flow packing: two absent sides match vacuously (undefined===undefined) while absent-vs-present breaks the row connection; always-defined changes which rows connect. |
| med | `shared/qr/services/compositional-utils.ts:98` | Grid positions are not backfilled onto QR-decoded steps, so LOOP executors that validate/chain on startPosition/endPosition see them unset. |
| med | `features/create/shared/services/orientation-alignment-calculator.ts:121` | Orientation alignment returns null so the LOOP circularization option for that bridge pictograph is unavailable; the endOrientation half of the check survives migration. |
| med | `features/choreo-card/services/start-ori-register.ts:40` | The position-family fallback derivation is skipped, positionFamilyOf returns null, and callers leave the start orientation at the radial default. |
| med | `features/choreo-card/services/hand-path-data-builder.ts:212` | correctColorAssignment skips the blue/red trace-swap correction, so hand-path traces may remain assigned to the wrong color on the card. |
| med | `features/create/shared/services/step-operations/turns-handler.ts:221` | findPreviousRotationDirection skips motionless beats in the backward scan and defaults CLOCKWISE; same shape as apply-turns-to-motion's context scan. |
| med | `shared/create/services/apply-turns-to-motion.ts:83` | findRotationContext skips beats with no motion for the hand while scanning for a rotation direction, defaulting to CLOCKWISE if none found; fabricated motions could now supply a direction. Signal partly survives via the NO_ROTATION value check. |
| med | `shared/create/services/turn-pattern-manager.ts:79` | Not a plain default: null in an extracted pattern entry is the 'skip this hand' signal consumed by applyPattern's entry.blue !== null check, so absence at extract time disables that slot forever; always-true bakes fabricated turns into saved patterns. |
| med | `features/create/shared/services/rotation-direction-pattern-manager.ts:515` | Orientation propagation after rotation-pattern apply skips hand pairs where either beat lacks the motion (verified as the twin of turn-pattern-manager:176 by grep shape and file structure). |
| med | `shared/create/services/step-transforms.ts:189` | After rotating a step in 'both' mode, start/end positions are only re-derived when both motions exist — a one-hand step keeps its STALE pre-rotation positions; after migration positions always re-derive. |
| med | `features/create/spell/services/orientation-continuity-validator.ts:91` | Transition validation is vacuously VALID for any hand missing a motion on either side — no orientation-break error can be raised; after migration synthesized motions get validated and can newly reject spell-generation transitions. |
| med | `features/create/generate/shared/services/pictograph-filter.ts:62` | filterByRotation EXCLUDES options missing either motion from the rotation-filtered candidate list (same pattern at line 162); after migration no option is filtered for absence, changing generation candidate pools. Medium because generator options are normally two-handed codex data. |
| med | `shared/create/services/apply-turns-to-motion.ts:215` | applyPendingTurnsToOption returns the option unchanged — pending turns and rotation directions from the turns bar are NOT applied to a one-hand option; after migration turns always apply. |
| med | `features/create/shared/services/step-operations/rotation-direction-handler.ts:225` | recalculateLetterAsync (and recalculateLetterForBeat at line 299) silently skips letter re-derivation for steps missing a motion, leaving letter and word untouched; after migration the lookup always runs and can rewrite the beat's letter and the sequence word. |
