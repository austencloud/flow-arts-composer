# Locomotion Research Canon

Last verified: 2026-08-28

This document turns locomotion research into TKA engineering decisions. It is
the required starting point for work on walking, footfall planning, gait timing,
starts, stops, turns, lateral movement, foot planting, retargeting, terrain, and
motion matching.

It is not a claim that every cited method is implemented. Each entry separates
evidence from the decision TKA has made and the code owner that would carry it.
Read `.claude/rules/locomotion.md` before changing locomotion behavior.

No finite document can contain every locomotion paper. This canon tracks the
sources that change a TKA decision, establish an evaluation method, or supply a
candidate dataset. A source that does none of those belongs in working notes,
not this file.

## Status and evidence vocabulary

Decision status:

- **Shipped**: verified in `main` at the date above.
- **Prototype**: verified in a task branch or lab, but not a production contract.
- **Adopted**: the architecture direction is accepted, but implementation is
  incomplete.
- **Evaluate**: promising research, with no adoption decision yet.
- **Reference only**: useful evidence that does not define TKA behavior.
- **Rejected**: an approach TKA must not use as its behavior owner.

Evidence type:

- **Peer-reviewed**: a published paper or systematic review.
- **Research preprint**: a primary manuscript that has not been verified here as
  peer-reviewed.
- **Production documentation**: current documentation or a production talk from
  a shipping animation stack.
- **Practitioner guidance**: an experienced animation engineer's documented
  technique. Useful, but not equivalent to a controlled study.
- **Dataset**: motion or biomechanical data. Availability does not imply product
  or training rights.

## Current TKA contract

The current ownership path is:

```text
authored destination / score intent
  -> destination and timing planners
  -> host execution (Walk Lab or Stage adapter)
  -> @austencloud/scene-3d LocomotionAnimator
  -> @austencloud/scene-3d FootPlanter
  -> gait diagnostics and live visual review
```

The owners have deliberately different jobs:

1. `src/lib/shared/3d/locomotion/destination-walk-plan.ts` owns exact
   straight-line root progress from `from`, `to`, and integer footfall count. It
   does not choose contacts, clips, swing arcs, or a final stance.
2. `LocomotionAnimator` in `@austencloud/scene-3d` owns the monotonic gait clock,
   animation time, directional clip blend, contact curves, and stride scaling.
   The package is modified in this repository through
   `patches/@austencloud__scene-3d@0.1.6.patch`.
3. A terminal transition owner must select and execute the braking and landing
   window. `TerminalStepPlan` is the adopted seam. Its implementation must be
   verified on the current branch before use.
4. `FootPlanter` is a late contact and IK correction layer. It may realize a
   declared anchor without replacing the source motion or deciding what counts
   as a step.
5. `GaitTimingPlan` is the adopted seam for externally authored plant times.
   Musical score time stays canonical when Stage supplies a schedule. A gait
   enum, speed curve, or eased root track is not an authored footfall schedule.
6. `src/lib/features/stage/locomotion/motion-matching/` contains feature
   extraction, trajectory construction, nearest-neighbour search, and a
   controller named `MmLocomotionController`. At the last verification the
   controller did not build or query the database. Treat it as unfinished
   infrastructure, not a shipping motion-matching solver and not a reason to
   create a parallel system.
7. `measureStandingStance` / `planStandingStance` / `applyStandingStance` in
   `@austencloud/scene-3d` `src/lib/services/leg-geometry.ts` own the **static
   standing base** a performer holds when nothing is driving its legs. This is
   not locomotion: it owns no gait clock, no contact schedule, and no footfall
   plan. `Avatar3D.svelte` calls it once at load, and only when
   `enableLocomotion` is false. The moment a clip or a planner drives the legs,
   that owner writes the same bones every frame and the standing pose is gone,
   which is the intended relationship. Do not add a second stance solver, and do
   not extend this one into swing, contact, or step planning.

8. The **speed axis** of a gait is owned by `LocomotionAnimator`, not by any
   caller. `RUN_TIER_KEYS` maps `forward`, `strafeLeft`, and `strafeRight` onto
   `runForward`, `runStrafeLeft`, and `runStrafeRight`; `runTierFraction()`
   derives the crossover band from the two clips' own measured `nativeSpeed`
   (`WALK_TIER_CEILING` 1.15 to `RUN_TIER_FLOOR` 0.8) rather than from a written
   speed; and `getGaitTier()` reports the blend a viewer can see. Both tiers
   read the same `gaitSteps` clock, so the crossover is phase-matched by
   construction and needs no transition state. Reaching a run by multiplying
   playback rate is forbidden: `updateGaitSplit` caps authored stride at 1.15,
   so past that everything lands on rate and the result is a speed-walk, which
   has double support where a run has flight. Shipped 2026-09-03; design in
   `docs/superpowers/specs/2026-09-03-locomotion-gait-tiers-design.md`.
9. **How fast a body is allowed to become** is a separate owner:
   `advanceGroundVelocity()` in `packages/camera-3d/src/lib/ground-velocity.ts`,
   called by `UnifiedCameraController` through `groundAcceleration` and
   `groundDeceleration`. It bounds the velocity *vector*, so a hard turn carries
   through its arc; it selects its rate by comparing magnitudes, so releasing a
   sprint brakes rather than coasts; and omitting the props means infinite
   acceleration, which reproduces instant response exactly. This is not a gait
   owner and must not acquire clip, contact, or phase knowledge.
10. **Pelvis height while walking** is owned by `LocomotionAnimator`, not by
    `FootPlanter`. The pack's locomotion clips are re-anchored at the rig's
    rest height, which discards the dip a walk is authored with, so the flat
    foot ended above the floor and the planter, which never drags the pelvis
    down, held the toe on the ground instead. `measureBindFloor()` reads the
    bind ankle and the bind ball of the foot once at `initialize()`;
    `analyzeClipGait()` records each clip's `pelvisDrop` as the cycle mean,
    over every probe sample a foot declares contact, of that sole's height
    over the bind floor (the ankle over its bind height or the ball of the
    foot over its own, whichever reads lower; in double support the higher
    sole answers); `blendedPelvisDrop()` lowers the pelvis by the
    effective-weight blend of those dips every `update()`, so a standing
    body keeps rest height and a crossfade lowers the body on the same curve
    that brings the legs in. Measured 2026-09-06 across the twelve shipped
    rigs: walks 0.032-0.053, strafes 0.051-0.065, runs 0.116-0.149. A
    per-phase drop curve was built, measured, and rejected the same day: on
    ch01 at 1.37 m/s it took the planted sole from 2.0 cm to 1.4 cm of the
    floor and added 2.2 cm of pelvis bob every stride (10.3 cm against
    8.1), and the bounce is what an eye reads. The retarget error that
    remains (leading sole up to 2 cm high at heel strike, trailing toe up to
    1.9 cm low at heel-off, the toe held out of the floor by the planter's
    clamp) is a leg-proportion mismatch that a retargeter with foot IK goals
    would absorb in the knees; that is the open gap, and it is not the
    pelvis. Contract in `tests/unit/3d/locomotion-pelvis-drop.test.ts`.

    Since 2026-09-07 (e086abff42) that retargeter exists:
    `bakeContactPreservedLegs` in `ContactRetargeter` solves every stance onto
    the rig's legs and writes a pelvis track that stands them on the floor, so
    the bake carries almost all of the dip and `pelvisDrop` is the residual
    the baked clip still leaves. The pelvis-drop bands were not re-derived
    when that landed and the suite stayed red locally (CI skips it without
    the rigs) until 2026-09-24. The bake also had a real defect: it scaled
    the ankle's height over the floor with the leg, so every rig's planted
    ankle came out at the source's 0.109 leg lengths rather than its own,
    and the residual took up the error with the whole body (ch07 -0.043 and
    a planted sole 5.1 cm in the air, ch34 +0.024). The bake now measures hip
    heights up from `legBase`, the floor raised by the rig's own bind ankle
    height and lowered by the source's planted-ankle median. Measured
    2026-09-24 across the twelve rigs, as the whole dip (baked track mean
    under rest plus residual): walks 0.045-0.074, strafes 0.057-0.076, runs
    0.128-0.150, run strafes 0.098-0.141; forward and strafe residuals within
    0.017 of zero; planted sole at most 1.8 cm over the floor. The run bobs
    94% of its authored pelvis travel on ch01 (6.89 of 7.32 cm) and a little
    less than the walk (7.05 cm): the pack's run and walk lift the pelvis
    within 4% of each other, and holding stances exactly on the floor trims
    the run's by 6%.

    The terminal stops are not walks and are not baked. Until 2026-09-24
    they borrowed the forward walk's `pelvisDrop`, which the bake had left
    at about zero, so the stop's captured standing pose (knees about 150
    degrees against idle's 163 to 167) hung under a pelvis held at rest
    height and every rig settled with both soles 3.6 to 5.3 cm up (Remy
    7.0). `analyzeTerminalStop()` now measures each stop on the rig at
    `createActions()`: a drop curve per sidecar frame, from the higher sole
    over the feet the sidecar declares down, smoothed by six [1, 2, 1]
    passes, and `blendedPelvisDrop()` samples it at the frame the stop is
    showing. A curve here and not the walks' mean because a stop ends in a
    held pose: a mean over the braking steps leaves that pose a centimetre
    off the floor for as long as it is held, and the bounce that rejected
    the walks' curve is two steps long here, not every stride. Settled
    soles are now within 1.5% of hip height on all five Walk Lab rigs, and
    the settled pelvis sits about 3 cm below idle because the capture's
    standing knees are bent. Contract in
    `tests/unit/3d/terminal-stop-stance.test.ts`.
11. **Clip loop seams and the mixer's write skip** are owned by
    `LocomotionAnimator`. The pack's converted clips key from one frame in
    (0.0333 s at 30 Hz) while their duration counts from zero, and their last
    key repeats their first, so every loop held the first pose for two extra
    60 Hz ticks per stride. `trimLeadingHold()` moves each clip's keys to
    zero and its duration to its last key in `createActions()`, copying the
    time arrays rather than editing them because the loader hands every
    channel of one sampler the same array. Separately, three.js
    `PropertyMixer` only writes a bound property when the accumulated value
    changed, so zeroing the pelvis before `mixer.update()` left the pelvis at
    zero on the frame the track repeated its value: the whole body dropped by
    the bob for one frame, 3.7 cm once per stride on ch01, and the gait probe
    read that frame as the lowest sole and under-measured `pelvisDrop` by
    half. `update()` and the probe now restore the previous track value
    before the mixer runs. Both measured and fixed 2026-09-06; the seam and
    single-frame contracts live in the same test file as item 10.

The governing TKA designs are:

- `docs/superpowers/specs/2026-08-27-exact-step-locomotion-design.md`
- `docs/superpowers/specs/2026-08-28-stage-footfall-planning-handoff.md`
- `docs/superpowers/specs/2026-08-28-gait-timing-plan-experiment.md`, when that
  file is present on the working branch

Implementation state changes faster than this document. Before editing, prove
the relevant symbols and tests still exist with repository search. Do not turn
the status labels above into an excuse to trust stale paths.

## Non-negotiable behavior contracts

### Exact destination and step count

For a straight path of distance `D`, `N` authored footfalls, and duration `T`:

```text
mean step length = D / N
cadence          = N / T
mean speed       = D / T
```

When `D`, `N`, and `T` are locked, cadence, mean step length, and mean speed are
derived. The UI may expose all of them, but it must identify which constraints
are authored and which are derived.

The endpoint must be reached on footfall `N`, without an endpoint snap and
without a hidden footfall `N + 1` inside the idle transition. Curved paths need
arc-length progress. Crossed and dance steps need per-foot poses; `D / N` is
only a summary for those patterns.

[Task-based Locomotion](https://www.cs.ubc.ca/~van/papers/2016-TOG-taskBasedLocomotion/index.html)
demonstrates why generic root travel is insufficient for task-specific movement:
footstep plans can include side steps, toe and heel pivots, duration, effort,
and character-proportion retargeting. Epic's
[Distance Matching](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-matching-in-unreal-engine)
and [Motion Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-warping-in-unreal-engine)
show the production separation between selecting animation progress from
distance and applying a bounded target-transform correction.

TKA decision: **Shipped** for straight mark-to-mark root progress. **Adopted**
for per-foot footprint plans and exact goal stance. The latter is not a truthful
runtime input until the animator and contact layers accept it.

### Gait timing and musical time

Walking to a beat is an auditory-motor synchronization problem, not a playback
speed preset. A systematic review of gait synchronization identifies footfall
phase relative to the nearest beat, tempo-matching error, and timing variability
as distinct measures. It also reports that synchronization depends on task and
instruction; spontaneous beat alignment cannot be assumed.

Source: [Entrainment and Synchronization to Auditory Stimuli During Walking](https://pmc.ncbi.nlm.nih.gov/articles/PMC6028729/)
(peer-reviewed systematic review).

TKA decision: **Adopted**. Stage authors plant events in score time through one
external `GaitTimingPlan`. The animator realizes the schedule while preserving a
monotonic gait clock. Diagnostics must report plant-time error and its spread,
not only cadence. Do not infer exact plants from beat-local root minima or from
an animation clip's nominal BPM.

### Starts, stops, and terminal steps

Human stopping is a transition with phase-dependent decisions, reduced push-off,
braking, and a selected final placement. It is not steady locomotion with speed
set to zero.

- [Analysis of Rapid Stopping During Human Walking](https://pubmed.ncbi.nlm.nih.gov/9658047/)
  found swing-leg braking, inhibited stance-leg push-off, and phase-dependent
  decisions about an additional step.
- [Motor programmes for the termination of gait in humans](https://pmc.ncbi.nlm.nih.gov/articles/PMC2279001/)
  measured different braking programs in stance and swing limbs and adaptation
  with approach speed.

TKA decision: **Adopted**. A `TerminalStepPlan` must be known at least one step
ahead and carry remaining distance, terminal foot, contact schedule, target
facing, and a root-distance curve or authored stop motion. The animator owns the
window. FootPlanter may preserve the declared support anchor. Freezing an
arbitrary walk-loop phase and blending to idle is **Rejected**.

Every caller's root follows the stop's distance curve once braking begins:
destination walks through `sampleDestinationWalkPlan`, time-scripted walk
patterns through `samplePatternTerminalTravel`. The captured stop has nearly
halted before its terminal foot lands, so a root held at walking speed to the
mark drags the planted feet and the plant slides them to catch up after landing
(23 cm in 0.13 s on the 2026-09-24 shuttle). A pattern arms on the gait boundary
nearest a one-and-a-half-stride stop and scales the braking cadence so the root
enters the brake at the same pace a destination walk does.

Letting go of a stop is part of the stop. Clearing the plan, which a turn or the
next walk does on its first frame, hands the held stance to idle or walking on
the same spring the other clips blend on, so the outgoing weight and the
incoming weight always sum to one. Before 2026-09-24 the clear zeroed the stop
clip while idle was still at zero, three.js filled the gap with the bind pose
for a frame, and every rig's ankles jumped 2.5 to 4.6 m/s (7 to 11 m/s with
planting off) on the first frame of the shuttle's about-face.
`tests/unit/3d/terminal-stop-release.test.ts` pins the release on every rig.

Where a stop leaves the feet is measured on the rig, in two parts, both from
2026-09-24. First, the braking stride scale divides the plan's step distances
by the ground the stop's declared stance feet cover on this rig
(`analyzeTerminalStop().travel`), not by the sidecar's `nativeTravelMeters`,
which is the capture's own metres: Remy covers 1.51 m on a stop the sidecar
calls 0.78, so its scale sat on the 1.75 clamp and its planted ankles ended
0.34 and 0.79 m ahead of the settled pose, which the about-face then tore back
at 6 to 7 m/s. Second, the stride warp scales a foot's offset from the pelvis,
which is neutral only for a foot the body walks over; a stop's last feet settle
ahead of the pelvis (the ball of the foot 15 to 25 cm ahead on ch01), so even a
correct scale of 1.27 planted them 7 cm ahead. `getSettlingPlants()` hands
`FootPlanter` the shift each foot's final plant needs instead: the root's
remaining plan distance less that anchor's remaining retreat under the body in
the clip, taken at the landing and faded in across the foot's last swing, live
once it is down. Every rig now plants within about a centimetre of the settled
pose, with no rise in peak swing speed. Contract in
`tests/unit/3d/terminal-stop-stance.test.ts`.

### Step turns, spin turns, pivots, and facing

Turning is foot placement plus weight transfer and braking. Root yaw alone is
not a turn.

- [Turning Strategies During Human Walking](https://pubmed.ncbi.nlm.nih.gov/10368408/)
  describes phase-dependent step and spin turns, with the forward braking leg
  influencing the selected strategy.
- [A three-dimensional biomechanical comparison between turning strategies](https://pubmed.ncbi.nlm.nih.gov/16129503/)
  found a wider support base and lower demands for the studied step turns than
  spin-turn variants.
- [Bases for the selection of alternate foot placement during straight- and
  turning-gait](https://pubmed.ncbi.nlm.nih.gov/40876264/) found different,
  stereotyped alternate placements for step and spin turns across turn angles.

TKA decision: **Prototype** for authored turn clips and seam-matched facing.
**Adopted** for a planner that selects turn family, pivot/support foot, amount,
and phase window. `TerminalStepPlan.targetFacing` is not complete until runtime
evidence proves the plan actually drives facing. Arbitrary angle support may
compose authored clips and bounded warping, but must not rotate the root under
two stationary feet.

### Lateral stepping, crossover, and grapevine

Sidesteps and crossovers are different movement classes. A crossover places the
moving limb beyond the body's midline and requires a different support strategy.
Front and back crossovers are both legitimate patterns.

- [Bilateral ground reaction forces and joint moments for lateral sidestepping
  and crossover stepping tasks](https://pmc.ncbi.nlm.nih.gov/articles/PMC3737798/)
  records distinct bilateral mechanics for the two tasks.
- [Perturbation-evoked lateral steps in older adults](https://pmc.ncbi.nlm.nih.gov/articles/PMC6501204/)
  distinguishes lateral sidestep, front crossover, back crossover, and medial
  sidestep strategies.
- [Contact-Aware Retargeting of Skinned Motion](https://openaccess.thecvf.com/content/ICCV2021/html/Villegas_Contact-Aware_Retargeting_of_Skinned_Motion_ICCV_2021_paper.html)
  shows that self-contact preservation and interpenetration reduction are
  separate constraints during retargeting.

TKA decision: **Adopted architecture, not yet a general runtime capability**.
A grapevine must compile to explicit alternating foot poses and contact windows,
including side step, anterior cross, side step, and posterior cross. It needs
foot yaw, which leg passes in front or behind, toe clearance, support ownership,
pelvis travel, and target-facing intent.

A negative left/right leg-order margin is not automatically a collision. It is
expected during an intentional crossover. Pattern-aware diagnostics must
distinguish:

- permitted leg-order reversal with positive mesh and capsule clearance;
- foot or shin interpenetration;
- an invalid crossing direction for the authored template; and
- a discontinuous pose jump that skipped the swing path.

FootPlanter cannot synthesize a grapevine from a sidestep clip. The required
source motion must come from authored motion, a sufficiently covered motion
database, or a separately approved generative controller. IK remains the last
correction layer.

### Contact, foot locking, IK, and retargeting

Contact is explicit data. A low foot height is a useful signal, but it is not a
complete contact model.

- [Reducing Footskate in Human Motion Reconstruction with Ground Contact
  Constraints](https://openaccess.thecvf.com/content_WACV_2020/html/Zou_Reducing_Footskate_in_Human_Motion_Reconstruction_with_Ground_Contact_Constraints_WACV_2020_paper.html)
  combines contact detection with trajectory optimization.
- [UnderPressure](https://diglib.eg.org/items/def192e5-ad91-4409-b078-7d564fbaefb5)
  uses pressure-insole labels to estimate ground reaction forces and derives
  contact-aware IK cleanup.
- [Contact-Aware Retargeting of Skinned Motion](https://openaccess.thecvf.com/content/ICCV2021/html/Villegas_Contact-Aware_Retargeting_of_Skinned_Motion_ICCV_2021_paper.html)
  treats ground contact, self-contact, and interpenetration as retargeting
  constraints.
- [Inverse Kinematics and Foot Locking](https://theorangeduck.com/page/inverse-kinematics-foot-locking)
  is practitioner guidance for toe locking, inertialized acquire and release,
  automatic contact annotation, and offline cleanup. Its central boundary is
  useful here: IK modifies source animation rather than replacing it.
- Epic's [Speed Planting](https://dev.epicgames.com/documentation/en-us/unreal-engine/fix-foot-sliding-with-ik-retargeter-in-unreal-engine)
  uses source foot-speed curves and IK goals to correct retargeting slip.

TKA decision: **Shipped** for late contact locks and leg IK. **Adopted** for
source contact labels, toe-aware anchors, confidence, per-rig reach limits, and
contact-aware retargeting. Foot locks must release safely when the correction
would break the source pose. A stride warp is a correction about the pelvis for
cyclic steps; a transition that ends in a held stance supplies each final
plant's shift (`FootPlanterInput.settlingPlants`) rather than letting the warp
scale a stance it does not walk over. Pulling the pelvis down until every foot reaches is
not acceptable motion quality.

Free arms are retargeted too. Copying the pack's upper-arm rotations onto a
wider body hangs the hands inside the thighs: before 2026-09-24, standing idle
put X-Bot's thumb 5.6 cm into its thigh, Remy's hand 4.9 cm, Y-Bot's 3.0 cm and
ch34's 12.5 cm. The clearance that already existed only covered IK-held prop
arms against the face, neck and torso, so a hand driven by the walk clips was
never checked against the legs. **Shipped** as `ArmClearanceRetargeter` in
scene-3d, run once per clip in `prepareClip` after the legs are fitted. It
measures each thigh's skin as a radius table in its own bone frame, finds the
smallest outward swing of the upper arm that keeps every hand vertex 1.2 cm
clear, caps it at 30 degrees, and eases it over 0.12 s either side. This is
Mixamo's Character Arm-Space setting measured per rig instead of dialled by
hand. Clean rigs get almost nothing (ch12 0.2 degrees, ch44 none); X-Bot gets
up to 7 and ch34 up to 29. The bake reads the body, not only the skeleton, so
the prepared-clip cache key carries a digest of the skin: X-Bot and Y-Bot share
one skeleton and need different arms. `tests/unit/3d/arm-thigh-clearance.test.ts`
checks the result against fully skinned vertices with geometry the bake does
not share.

### Motion matching, warping, and learned controllers

Motion matching selects recorded poses that jointly fit the current pose and a
desired future trajectory. It does not invent missing stops, pivots, lateral
steps, or dance vocabulary.

- Ubisoft's [Motion Matching and The Road to Next-Gen Animation](https://www.gdcvault.com/play/1023280/Motion-Matching-and-The-Road)
  is the production origin for continuous pose-and-plan search over long motion
  capture sequences.
- Epic's current [Motion Matching documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine)
  queries future trajectory and pose features including both feet. It also
  documents an experimental Crashing Legs channel. More data expands available
  behavior; weights do not repair absent coverage.
- [Learned Motion Matching](https://static-wordpress.ubisoft.com/montreal.ubisoft.com/wp-content/uploads/2020/07/09154101/Learned_Motion_Matching.pdf)
  compresses and generalizes motion-matching behavior with a learned model.
- [Control Operators for Interactive Character Animation](https://theorangeduck.com/media/uploads/other_stuff/ControlOperators.pdf)
  demonstrates designer-composable control over both learned motion matching
  and an autoregressive flow-matching controller.
- [Environment-aware Motion Matching](https://arxiv.org/abs/2510.22632)
  adds environmental and nearby-agent features so pose and trajectory selection
  can respond to obstacles.

TKA decision: **Evaluate** completion of the existing motion-matching owner.
Do not add a second database, search stack, or controller beside
`src/lib/features/stage/locomotion/motion-matching/`. Before adoption, prove
runtime database construction and querying, contact-labelled coverage, stable
transitions, cross-rig retargeting, web performance, deterministic score-time
control, and rejection costs that permit intentional crossover without allowing
interpenetration.

Warping and inertialization are bounded correction tools. Epic documents
[Orientation, Stride, and Slope Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/pose-warping-in-unreal-engine)
as pose adjustments that align animation with movement. They do not replace
missing motion data.

### Terrain

[Phase-Functioned Neural Networks for Character Control](https://theorangeduck.com/page/phase-functioned-neural-networks-character-control)
demonstrates a learned phase-conditioned controller trained across rough terrain,
obstacles, jumps, and crouches. Epic's Slope Warping is a production correction
for terrain alignment.

TKA decision: **Reference only** until Stage has a terrain-traversal requirement.
Current floor locomotion should keep one explicit ground plane and per-rig sole
offset. A future terrain controller must sample environment geometry as planning
input; a downward raycast plus ankle IK is not sufficient for ledges, stairs,
or obstacle negotiation.

### Music-conditioned dance generation

Generative dance research is useful for coverage, in-betweening, and constraint
interfaces. It is not evidence that a generated clip is stage-ready.

- [AIST++ / AI Choreographer](https://research.google/pubs/ai-choreographer-music-conditioned-3d-dance-generation-with-aist/)
  provides a large music-and-3D-motion benchmark across ten genres.
- [EDGE](https://openaccess.thecvf.com/content/CVPR2023/html/Tseng_EDGE_Editable_Dance_Generation_From_Music_CVPR_2023_paper.html)
  supports temporal and joint constraints, adds contact-consistency training,
  and reports that common automated metrics do not track human judgments well.
- [FineDance](https://openaccess.thecvf.com/content/ICCV2023/html/Li_FineDance_A_Fine-grained_Choreography_Dataset_for_3D_Full_Body_Dance_ICCV_2023_paper.html)
  broadens genre and hand-motion coverage.

TKA decision: **Evaluate** as an offline candidate generator after deterministic
footfall constraints exist. Generated motion must pass the same endpoint,
contact, self-intersection, joint-continuity, rig-retarget, and live visual gates
as authored motion. A beat-alignment score alone is not acceptance.

## Source and decision ledger

`Runtime owner` names where adoption belongs. It does not claim the capability
already exists there.

| Problem class                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                  | Type                                               | TKA decision and status                                                                                                                 | Runtime owner                                                             | License or asset status                                                                                    | Last verified |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| Exact task-specific footprints                  | [Agrawal and van de Panne, 2016](https://www.cs.ubc.ca/~van/papers/2016-TOG-taskBasedLocomotion/index.html)                                                                                                                                                                                                                                                                                               | Peer-reviewed                                      | Adopt footstep-plan semantics; exact arbitrary footprints remain **Adopted**                                                            | destination planner, future footprint-plan compiler, `LocomotionAnimator` | Citation only; paper is not an asset grant                                                                 | 2026-08-28    |
| Exact root progress and bounded correction      | [Epic Distance Matching](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-matching-in-unreal-engine), [Motion Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-warping-in-unreal-engine)                                                                                                                                                                   | Production documentation                           | Straight exact-step planner is **Shipped**; bounded target warping is **Evaluate**                                                      | `destination-walk-plan.ts`, `LocomotionAnimator`                          | Reference only; no Epic code or assets imported                                                            | 2026-08-28    |
| Beat-authored gait timing                       | [Auditory gait synchronization review](https://pmc.ncbi.nlm.nih.gov/articles/PMC6028729/)                                                                                                                                                                                                                                                                                                                 | Peer-reviewed systematic review                    | External plant schedule and phase-error metrics are **Adopted**                                                                         | `GaitTimingPlan`, score-time host, diagnostics                            | Open-access article; citation does not grant motion assets                                                 | 2026-08-28    |
| Gait termination                                | [Hase and Stein, 1998](https://pubmed.ncbi.nlm.nih.gov/9658047/), [Crenna et al., 2001](https://pmc.ncbi.nlm.nih.gov/articles/PMC2279001/)                                                                                                                                                                                                                                                                | Peer-reviewed                                      | Remaining-distance, phase-aware terminal step is **Adopted**                                                                            | `TerminalStepPlan`, `LocomotionAnimator`                                  | Citation only                                                                                              | 2026-08-28    |
| Step and spin turns                             | [Hase and Stein, 1999](https://pubmed.ncbi.nlm.nih.gov/10368408/), [Taylor et al., 2005](https://pubmed.ncbi.nlm.nih.gov/16129503/), [Kreter and Fino, 2025](https://pubmed.ncbi.nlm.nih.gov/40876264/)                                                                                                                                                                                                   | Peer-reviewed                                      | Turn-family, support-foot, and phase selection are **Adopted**; current clips are a **Prototype**                                       | turn planner, `LocomotionAnimator`                                        | Citation only                                                                                              | 2026-08-28    |
| Lateral sidestep and crossover                  | [Bilateral lateral gait study](https://pmc.ncbi.nlm.nih.gov/articles/PMC3737798/), [perturbation-evoked lateral steps](https://pmc.ncbi.nlm.nih.gov/articles/PMC6501204/)                                                                                                                                                                                                                                 | Peer-reviewed                                      | Treat as distinct gait classes; grapevine footprint template is **Adopted**, not shipped                                                | footprint-plan compiler, asset pipeline, diagnostics                      | Citation only                                                                                              | 2026-08-28    |
| Ground contact and footskate                    | [Zou et al., WACV 2020](https://openaccess.thecvf.com/content_WACV_2020/html/Zou_Reducing_Footskate_in_Human_Motion_Reconstruction_with_Ground_Contact_Constraints_WACV_2020_paper.html), [UnderPressure](https://diglib.eg.org/items/def192e5-ad91-4409-b078-7d564fbaefb5)                                                                                                                               | Peer-reviewed                                      | Explicit contact labels and contact-constrained cleanup are **Adopted**                                                                 | asset pipeline, `FootPlanter`, diagnostics                                | Papers are reference material; UnderPressure code/data require separate license review                     | 2026-08-28    |
| Runtime foot locking                            | [Holden, 2026](https://theorangeduck.com/page/inverse-kinematics-foot-locking), [Epic Speed Planting](https://dev.epicgames.com/documentation/en-us/unreal-engine/fix-foot-sliding-with-ik-retargeter-in-unreal-engine)                                                                                                                                                                                   | Practitioner guidance and production documentation | Toe-aware late correction is **Shipped/Adopted**; IK as motion generator is **Rejected**                                                | `FootPlanter`                                                             | Techniques may be studied; verify linked code licenses before copying code                                 | 2026-08-28    |
| Contact-aware retargeting and self-intersection | [Villegas et al., ICCV 2021](https://openaccess.thecvf.com/content/ICCV2021/html/Villegas_Contact-Aware_Retargeting_of_Skinned_Motion_ICCV_2021_paper.html)                                                                                                                                                                                                                                               | Peer-reviewed                                      | Per-rig self-contact preservation and interpenetration checks are **Adopted**                                                           | retarget/import pipeline, diagnostics                                     | Citation only; no model or dataset license inferred                                                        | 2026-08-28    |
| Paired upper-body IK routing                    | [Unity Two Bone IK Constraint](https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.2/manual/constraints/TwoBoneIKConstraint.html), [Epic Full-Body IK](https://dev.epicgames.com/documentation/unreal-engine/control-rig-full-body-ik-in-unreal-engine)                                                                                                                                       | Production documentation                           | Measured body axes, torso participation, deterministic over/under elbow corridors, and production head-threat avoidance are **Shipped** | `AvatarAnimator`, `SpineTwister`, `ElbowPoleComputer`                     | Reference only; no Unity or Epic code or assets imported                                                   | 2026-08-30    |
| Motion matching                                 | [Ubisoft GDC 2016](https://www.gdcvault.com/play/1023280/Motion-Matching-and-The-Road), [Epic Motion Matching](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine)                                                                                                                                                                                              | Production talk and documentation                  | Complete existing search owner before adoption; current runtime is **Unfinished/Evaluate**                                              | `features/stage/locomotion/motion-matching`                               | Reference only; animation databases require their own licenses                                             | 2026-08-28    |
| Learned motion control                          | [Learned Motion Matching](https://static-wordpress.ubisoft.com/montreal.ubisoft.com/wp-content/uploads/2020/07/09154101/Learned_Motion_Matching.pdf), [Control Operators](https://theorangeduck.com/media/uploads/other_stuff/ControlOperators.pdf)                                                                                                                                                       | Peer-reviewed                                      | Offline experiment only after deterministic constraints and licensed data; **Evaluate**                                                 | existing motion-matching owner or a separately approved production owner  | Papers are citation material; reference implementations and training data need separate review             | 2026-08-28    |
| Terrain adaptation                              | [PFNN](https://theorangeduck.com/page/phase-functioned-neural-networks-character-control), [Epic Pose Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/pose-warping-in-unreal-engine)                                                                                                                                                                                                 | Peer-reviewed and production documentation         | Flat-stage corrections only; full terrain control is **Reference only**                                                                 | future environment-aware planner, `LocomotionAnimator`, `FootPlanter`     | Reference only                                                                                             | 2026-08-28    |
| Environment and crowd-aware pose selection      | [Environment-aware Motion Matching](https://arxiv.org/abs/2510.22632)                                                                                                                                                                                                                                                                                                                                     | Research preprint                                  | Keep pose and trajectory collision constraints coupled if Stage adds crowds; **Evaluate**                                               | existing motion-matching owner and Stage path planner                     | Paper reference; official example code reports MIT, data licenses remain separate                          | 2026-08-28    |
| Music-conditioned dance                         | [AIST++](https://research.google/pubs/ai-choreographer-music-conditioned-3d-dance-generation-with-aist/), [EDGE](https://openaccess.thecvf.com/content/CVPR2023/html/Tseng_EDGE_Editable_Dance_Generation_From_Music_CVPR_2023_paper.html), [FineDance](https://openaccess.thecvf.com/content/ICCV2023/html/Li_FineDance_A_Fine-grained_Choreography_Dataset_for_3D_Full_Body_Dance_ICCV_2023_paper.html) | Peer-reviewed and dataset                          | Candidate generation only; deterministic runtime adoption is **Evaluate**                                                               | offline motion pipeline, footprint-plan validator                         | Dataset, video, music, model, and SMPL terms must each be cleared                                          | 2026-08-28    |
| General mocap coverage                          | [CMU Graphics Lab Mocap Database](https://mocap.cs.cmu.edu/)                                                                                                                                                                                                                                                                                                                                              | Dataset                                            | Suitable candidate for stop, turn, and crossover asset audit; **Evaluate**                                                              | asset pipeline                                                            | Site allows commercial use inside products, forbids resale of raw/converted data, and requests attribution | 2026-08-28    |
| General animation benchmark                     | [LaFAN1](https://github.com/ubisoft/ubisoft-laforge-animation-dataset)                                                                                                                                                                                                                                                                                                                                    | Dataset                                            | Research and benchmark only; **Rejected** for commercial product training or redistribution without new permission                      | offline evaluation                                                        | CC BY-NC-ND 4.0                                                                                            | 2026-08-28    |
| Large unified human motion corpus               | [AMASS](https://amass.is.tue.mpg.de/register.php)                                                                                                                                                                                                                                                                                                                                                         | Dataset                                            | Research comparison only; **Rejected** for product use under current terms                                                              | offline evaluation                                                        | Noncommercial research only, with subset-specific terms                                                    | 2026-08-28    |
| Dance motion and music                          | [AIST++ download terms](https://google.github.io/aistplusplus_dataset/download.html)                                                                                                                                                                                                                                                                                                                      | Dataset                                            | Do not ingest until each media and annotation right is documented; **Evaluate**                                                         | offline motion pipeline                                                   | API code is Apache-2.0; videos and music inherit AIST Dance DB terms; SMPL has separate terms              | 2026-08-28    |
| Pressure-labelled foot contacts                 | [UnderPressure repository](https://github.com/InterDigitalInc/UnderPressure)                                                                                                                                                                                                                                                                                                                              | Dataset and code                                   | Useful for contact-label evaluation; **Evaluate** after legal and technical review                                                      | asset pipeline, diagnostics                                               | Custom InterDigital license and citation requirement; do not assume permissive commercial rights           | 2026-08-28    |

## Dataset and asset gate

No agent may download, commit, convert, train on, or ship motion data merely
because it is public. Record all of these before ingestion:

- canonical source URL and exact version or download date;
- motion, code, audio, video, body-model, and derived-data licenses separately;
- commercial use, modification, redistribution, attribution, and trained-model
  restrictions;
- performers' permitted use and any identity or biometric constraints;
- skeleton, sample rate, coordinate system, units, contacts, root motion, and
  known capture defects;
- which required movement classes are actually present; and
- the repository owner and storage location for source and derived assets.

CMU is the most promising currently identified commercial-use source, but its
site warns that toe and hand channels can be noisy and forbids reselling the
data directly, even after conversion. That still requires an import manifest
and attribution plan.

## Evaluation contract

Automated metrics catch silent failures. They do not replace watching the full
motion at speed, from useful camera angles, on every supported rig.

### Geometric and timing correctness

- requested and observed footfall count;
- root endpoint error and per-foot goal-stance error;
- plant-time error relative to score, including mean, worst case, and spread;
- monotonic gait and distance clocks under different frame partitions;
- step length, width, foot yaw, and required crossover order;
- no endpoint correction, backward correction, or hidden settlement step.

### Contact and continuity

- stance-foot translation and yaw slip during declared contact;
- contact precision and recall when source labels exist;
- heel and toe clearance during swing;
- joint velocity, acceleration, and jerk, with named worst joint;
- pose and root discontinuities at clip selections, wraps, and rig swaps;
- foot, shin, knee, and mesh interpenetration;
- contact preservation after retargeting.

### Gait and balance

- cadence, duty factor, double support, support alternation, and pelvis sway;
- body-over-support and center-of-mass plausibility where the rig permits it;
- terminal braking and stable settlement as a separate measurement window;
- turn-family, support-foot, and facing accuracy;
- pattern-specific checks for sidestep, front crossover, back crossover, and
  grapevine.

### Anatomical validity

Every measurement above describes the path a foot traced or how far a joint
moved. None describes the plane a limb moved in, so a leg posed sideways scores
identically to a correct one. Two layers cover that, added 2026-09-03:

- **Static intake**, `tests/unit/3d/rig-anatomy-contract.test.ts`. Reads the
  bind pose of every shipped character and drives nothing: leg completeness,
  hip line level and square, derived knee hinge within 10 degrees of the body's
  mediolateral axis, left-right segment symmetry within 2 percent, femur-tibia
  ratio, and bind bend small enough not to steer the calibration. One GLB parse
  per rig, no frames, 74 checks in under half a second. This is the layer that
  catches a small calibration error, where a 10-degree fault is enormous.
- **Motion grading**, `analyzeKneeAnatomy` in
  `src/lib/shared/3d/diagnostics/gait/knee-anatomy.ts`, reported as three rows
  in every maneuver profile and driven with `FootPlanter` in the loop by
  `tests/unit/3d/locomotion-anatomy.test.ts`. Per frame and per side: how far
  the plane the knee bends in is turned off the body's frontal normal, the
  knee's worst departure from the hip-ankle line as a fraction of leg length,
  and whether the shank ever sits in front of the thigh. Frames below 20 degrees
  of flexion are excluded, because a near-straight leg has no measurable bend
  direction, and the excluded share is reported so a projection artefact cannot
  become a verdict.

Bands come from measurement, not from a guess: all twelve shipped characters,
walk and run, planted, measure 7.5 to 12.1 degrees of mean plane tilt, which
independently lands on the clinical figure of 8 to 12 degrees of frontal-plane
knee travel across a healthy gait cycle. Warn at 16, fail at 25.

The two layers cover different ranges and neither replaces the other. Injected
hinge error produces about 0.88 degrees of reading per degree at a walk and 0.72
at a run, on a baseline near 10, so motion grading resolves a 20-degree fault
and above while the static contract resolves everything smaller.

### Visual acceptance

Use Walk Lab in the approved in-app browser or Chrome DevTools setup. Inspect
the full maneuver, including departure, every plant, turn or crossover, arrival,
and settle. Test all shipped rigs and at least side, front, and quarter views.
Scrub or replay suspected seams. A metric dashboard with no visible review is
not proof of animation quality.

EDGE reports that common dance-generation metrics can disagree with human
judgments. That supports TKA's combined gate: deterministic metrics plus live
visual evaluation. It does not justify accepting visible defects because one
metric improved.

## Rejected assumptions

### A single hard-coded rotation can serve as a stance for every rig
Rejected 2026-09-03, with runtime bone measurements on four rigs.

`Avatar3D.svelte` widened the default stance with a fixed 8-degree rotation
about each upper leg's **own local Z**. A bone's local axes are a property of
the export, not of the body, so one constant behaved differently on every rig:
it abducted the Mixamo-derived catalog rigs (ch18 321 mm -> 549 mm ankle
separation, ch01 318 -> 564, ch07 326 -> 567) and adducted the intake rig
(239 mm -> 18 mm), which is the feet-stuck-together silhouette Austen reported
on `/test/staff-grip`. The rotation also raised the ankles off the bind pose
that `getFeetOffset()` had already measured, so every affected performer stood
a centimetre or two above the floor without anything reporting it.

A stance must be measured from the body it belongs to: hip sockets, ankles, and
the frontal plane they define. The replacement targets ankle separation equal to
the rig's own hip-socket separation, applies the rotation in world space about a
measured abduction axis, restores each foot's authored world orientation, and
returns the ankle height change so the host can re-ground the performer.

Two different upstream shapes feed that measurement, so do not read one rig's
numbers as the catalog's. The Mixamo-derived catalog rigs arrive at runtime in
their authored bind pose, ankles about 1.7x hip width apart. The intake rig
arrives with ankles at exactly 1.0x hip width, which is the signature of a
Blender intake that baked the GLB's embedded `mixamo.com` action - that clip's
first frame stands the rig at attention, and `pose.armature_apply()` writes it
in as the new bind pose (see `clear_imported_pose` in
`scripts/characters/blender-proportion-rescale.py`, landed 2026-09-03 in
`40180e87a8`). The runtime stance normalizes both shapes, so fixing the intake
bake does not invalidate it and it does not excuse leaving the bake in place.


### Foot-path and knee-angle metrics can see a leg posed in the wrong plane
Rejected 2026-09-03, by fault injection against the full gait report.

`ch07` shipped with its left knee's IK hinge axis derived 84 degrees off
sagittal, so the leg folded sideways under `FootPlanter`. Every row of the gait
report stayed green through it and Austen found it by looking at the screen.

Rotating `ch01`'s hinge by a controlled amount and re-reading the whole report
shows why. At 3.9 m/s, between a healthy hinge and one turned 84 degrees, peak
foot slip holds at 9.2 cm and `kneeJerkRms` holds at 11187.982 -- the two
readings differ in their eighth significant figure. The foot rows cannot
respond because the fault does not move the feet; it folds the leg between
them. `kneeJerkRms` looks like it should, being a knee measurement, but it is
the second time derivative of `kneeAngle`, and `kneeAngle` is the unsigned
interior angle at the joint. Turning the plane a knee bends in leaves how far it
bends exactly where it was.

This is structural, not a threshold that was set too loosely. A metric built
from unsigned joint angles and foot trajectories is blind to limb orientation by
construction, and no retuning of one makes it see this class of defect. The
harness compounded it: it stopped at the animator, and foot IK is where a leg is
finally posed, so the suite could not have observed the defect even had a metric
existed. Both are addressed under Anatomical validity above; the blindness
itself is pinned by an assertion so the claim cannot go stale silently.

| Assumption                                               | Why it is rejected                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root motion eliminates footskate                         | Source root and foot motion can still mismatch the world controller, retargeted rig, warping, blending, or contact anchors.                            |
| Motion matching naturally plants feet                    | Selection only chooses from available data. Contacts, coverage, retargeting, blending, and correction remain explicit concerns.                        |
| Inertialization or a crossfade can create a missing stop | Blending removes a small pose discontinuity. It does not create braking, final foot placement, or weight transfer.                                     |
| Setting velocity to zero is a terminal transition        | Human gait termination is phase- and speed-dependent and can require another placement.                                                                |
| Zeroing a clip's weight releases it                      | three.js fills any weight the actions leave missing with the bind pose. A release has to hand the weight to the next clip, not drop it.                 |
| A scripted root can keep its speed through a stop        | The stop clip decelerates before its terminal plant. A root that does not follow its distance curve drags the declared stance feet across the floor.   |
| A sidecar's source travel fits every rig                 | Retargeting keeps rotations, so ground covered grows with the leg. Remy covers twice the capture's 0.78 m; scaling against the sidecar planted its feet up to 0.79 m off. |
| A stop can borrow the walk's pelvis dip                  | The walks carry their dip inside the baked clip, so the borrowed residual is about zero and the stop's bent-knee settle hung 4 to 5 cm over the floor. |
| Scaling a stride about the pelvis keeps a stop's stance   | A stop's last feet settle ahead of the pelvis, so any scale other than 1 moves the settled stance by that offset times the scale's excess.              |
| Rotating the root under the avatar is a turn             | A believable turn selects support, places a foot, transfers weight, and rotates through an authored or data-covered window.                            |
| Negative leg order is always collision                   | Intentional front and back crossovers reverse left/right foot order. Collision requires geometry and continuity evidence.                              |
| IK can turn a sidestep into a grapevine                  | IK can correct a target near a valid source pose. It cannot supply the missing swing path, support sequence, pelvis action, or self-contact semantics. |
| Beat alignment equals authored footfalls                 | Cadence or root extrema do not prove which foot planted, at what score time, or for how long.                                                          |
| Exact root endpoint plus step count equals exact arrival | Root mark, terminal plant, and stable two-foot goal stance are different events.                                                                       |
| A public dataset is product-cleared                      | Code, annotations, video, music, performer data, body models, and derived assets can carry different terms.                                            |
| A cited technique is implemented                         | Research, adopted architecture, prototypes, and shipped behavior are separate status classes.                                                          |
| A knee metric detects a knee posed wrong                  | `kneeJerkRms` is the second derivative of an unsigned joint angle, which a rotated bend plane preserves exactly. Grading a limb needs the plane it moved in, not only how far it moved.  |
| Clip arm rotations fit every body                         | Retargeting keeps rotations, so a hand that hung beside a slim capture body lands inside a wider rig's thigh. Arm spacing is measured per rig, like the legs. |
| A harness that drives the animator tests the pose         | Foot IK poses the leg after the animator. A harness that stops short of it cannot observe an IK defect at all, whatever it measures.                                                    |
| Green unit tests prove top-tier motion                   | Tests cannot see twitching, implausible weight transfer, mesh penetration, or a bad silhouette. Live visual evidence is mandatory.                     |

## Open gaps, in priority order

1. **Grapevine ground truth and semantics.** Acquire or author left/right front
   and back crossover motion with contact labels. Define explicit footprints,
   foot yaw, support, clearance, and pattern-aware collision grading.
2. **Contact-aware retargeting across shipped rigs.** Measure how one source
   motion changes on short and tall rigs. Preserve intentional self-contact
   while preventing interpenetration.
   Hands against thighs is covered for clip-driven arms (see Contact, foot
   locking, IK, and retargeting); forearms against the torso during a free
   arm swing are not measured yet.
3. **Terminal transition coverage.** The state machine exists and runs
   (`TerminalKey`, armed/braking/landed/settled, `terminalEntryBlend`, contact
   curves), but the only shipped assets are `walk-stop-left` and
   `walk-stop-right`, so **stopping from a run plays a walk stop**. Author a run
   stop through `static/animations/terminal-stops/build-terminal-stops.py`; this is an asset gap, not a
   code gap. Also still open: distance-matched profiles for terminal foot,
   approach speed, remaining distance, and desired facing, and proof that
   `targetFacing` executes.
4. **External score-time gait schedule.** Land and prove `GaitTimingPlan` across
   different render-frame partitions without changing the requested plant times.
5. **Footprint-target runtime seam.** After timing works, add explicit left and
   right target pose/contact windows without turning FootPlanter into a planner.
6. **Motion-matching completion decision.** Either finish database build/search
   through the existing owner or record why the project will use authored
   transition sets instead. Do not leave the current name implying capability
   that runtime does not have.
7. **Asset provenance inventory.** Record every current locomotion clip's source,
   license, skeleton, root-motion curve, contacts, mirrored status, and supported
   rigs.
8. **Run-tier clip coverage.** There is no backward run, no jog mid-tier, and
   no run terminal stop. Each is a missing clip, and each is deliberately left
   as a gap rather than faked with playback rate. Importing CC0 clips
   (Quaternius is the candidate) is blocked on retargeting:
   `remapClipToSkeleton` recognises only `mixamorig1`, `mixamorig:`,
   `mixamorig`, and `""` bone prefixes. The dataset and asset gate applies
   before any download, conversion, or commit.
9. **A straight steady-state pattern for the walk lab.** Every sustained sample
   rides `CIRCLE_R = 2.6`, which at 3.9 m/s is a 1.5 rad/s turn no runner holds.
   This confounds `overSupportFraction`, which reads 49% at a walk and 0% at a
   run, and it cannot be separated without a straight sample.
10. **Human evaluation protocol.** Add repeatable blinded comparisons for
   grounding, weight, continuity, intent, and preference alongside diagnostics.
11. **Terrain scope.** Make an explicit product decision before adding slope or
   obstacle logic to flat-stage locomotion.
12. **Learned controller threshold.** Define the data volume, web runtime budget,
    determinism, editability, and licensing evidence required before training or
    shipping one.

## Maintenance protocol

Before non-trivial locomotion work:

1. Read `.claude/rules/locomotion.md` and this document.
2. Trace the current request through planner, animator, contact correction, and
   diagnostics. Verify the owner in source, not only in a handoff.
3. Search current-year official production documentation and primary research
   for the specific problem class.
4. State whether the change reuses, extends, composes, or creates an owner.
5. Record the adoption status and the proof required to change it.
6. If data or code will be imported, complete the dataset and asset gate first.
7. Run focused automated checks and live browser evaluation. Record both.

Update this canon when a source changes an architectural decision, a capability
moves from adopted to prototype or shipped, an owner changes, or a license is
cleared or revoked. Update `Last verified` only for the rows actually checked.
Do not paste a new bibliography into `.claude/rules/locomotion.md`; rules route
here so there is one research owner.
