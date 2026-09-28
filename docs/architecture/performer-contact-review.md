# Performer contact review

Status: review, 2026-09-24. Read-only findings, Austen's answers, and the
agreed plan. Steps 0 to 2 landed on local main on 2026-09-25 (see
[Results](#results-2026-09-25)), followed the same day by a check of the
staffs against the body itself (see
[Physical check](#physical-check-2026-09-25)); later steps wait on the
mapping sessions described below.

The complaint: the props go where the grid says, but the hands cannot reach
them and let go. This review asked whether the work on arm clipping, negative
space, wrist and hand contact, and finger curl is on a sustainable path.

## Verdict

- **Being done the right way:** no, 3/10 from three independent reviewers.
  Each session fixed the symptom in front of it by adding another per-frame
  rule. Nothing measured the gap between hand and staff, so fixes traded one
  problem for another that nobody saw.
- **Sustainable:** not as set up, 2/10. The performer code lives in a
  40,702-line pnpm patch (365 files, 286 of them `dist`) that sessions have
  overwritten five times. The careful grip and finger work runs in a lab-only
  contact mode that no production screen uses.
- **Likely to work soon** (red-team estimates, not measurements): floating
  frames cut about in half within a week, 75 to 85%; both symptoms mostly
  fixed in 3 to 4 weeks, 45 to 60%; negative space and body-turn routes in
  about 6 weeks, 25 to 35%, and that last figure depends on the mapping work.

The hands let go for three measured reasons. The largest is small: two steps
disagree about which way the palm faces.

## What was measured

A headless probe ran the production `AvatarAnimator` in the default `legacy`
contact mode (weld off) on ch07, ch12 and ch18. It played 26 sequences (19
core TnD sequences plus 7 lab fixtures from
`tests/tools/prop-continuity-corpus.ts`) and measured the palm-to-staff gap
every 1/60 s after the 6 cm render lock: 12,960 hand-frames per rig. Each
proposed fix was then applied on its own.

| Variant (gap over 3 cm)         | ch07          | ch18          |
| ------------------------------- | ------------- | ------------- |
| Today                           | 8,068 (62.3%) | 8,282 (63.9%) |
| Un-crossing split removed       | 7,988 (61.6%) | not run       |
| Wrist placement and twist agree | 4,039 (31.2%) | 4,320 (33.3%) |

The gap is measured to the staff centre line, so the visible gap is roughly
1 to 1.5 cm smaller (estimated from staff thickness). The wrist fix takes the
median gap from 4.7 cm to 0.

Limits: no browser; walking, idle, foot planting, spine pitch and head dodge
were off; tempo was one step per second; the finger mesh was excluded. The
probe lived in a temp folder, and step 0 below commits it.

## Cause 1: wrist placement and wrist twist disagree

In a square stance (hug blend at most 1e-4, body yaw under 65°),
`computeHandDirection` and `computeSocketTarget` place the wrist so that the
palm sits one palm length (about 9 cm) medial of it, on the staff. Later,
`applyWristOrientation` rolls the palm _normal_ medial instead. The two
directions are 90° apart, so the palm lands about √2 × 9 ≈ 13 cm from the
staff. The render lock moves the staff at most 6 cm, leaving 4.3 to 7.8 cm at
single-hand points the arm reaches easily.

- Square-stance frames over 3 cm: 97.3% (ch07) and 99.0% (ch18). Turned
  frames (65° or more, where the hug makes both steps agree): 7.5% and 9.0%.
- Frames where the un-crossing moved the hand 5 cm or less show the same
  96 to 99%, so this cause is independent of cause 3.
- No test checks palm position against the staff, and the labs weld the staff
  to the hand, which hides the defect. That is probably why grip looked
  solved on 2026-09-04 (inferred).

**Fix:** place the wrist from the orientation the twist step will produce.
Estimated 40 to 80 lines in one pair of functions, reaching both renderers
because they share the animator. In the probe, palms came under 6 cm apart on
8 (ch07) and 4 (ch18) of 6,480 pair-frames, and forearms came as close as
7 cm but never under 4 cm. The wrist rate limit was bypassed in the probe, so
a browser check is required.

## Cause 2: some grid points are out of reach

`GRID_RADIUS_3D` is 0.52 m, centred at 0.82 × height and 0.3 m in front of
the shoulders. From a square stance, the far cross-body point (East for the
left hand, West for the right) is 78 to 81 cm from the shoulder, while arm
plus hand reaches 61 to 64 cm. North is about 6 cm short for both hands;
South is marginal.

Real bodies close that distance with negative space and body turns (see
[negative-space-and-wall-plane-reach.md](../reference/negative-space-and-wall-plane-reach.md)).
In code, `MAX_REACH_LEAN` and forward pitch are 0, the hips never rotate, and
only a small clavicle raise remains. When a reach is still too far, clearance
retraction shortens the arm to as little as 0.6 of its length, caches that,
recovers 4% every 12 frames, and is never reset on seek, so a short arm can
persist about two seconds after a scrub (computed). Since 2026-09-27 the reach
grows back by time instead: from 0.6 to full length in 0.3 s at any frame rate.

## Cause 3: crossed hands get pulled apart

`separateAdjacentGripTargets` (added 2026-08-31) keeps the hands at least
7 cm apart, each on its own side. It has no upper bound, and it removes the
crossing before `computePairRouting` sees it, so the over/under routing added
two days earlier saw a crossing of exactly 0 in all 45 runs.

| Placement                | Kind              | Each hand moved off its staff |
| ------------------------ | ----------------- | ----------------------------- |
| ALPHA7 (left E, right W) | crossed           | 55.5 cm                       |
| ALPHA6, ALPHA8           | crossed diagonals | 40.3 cm                       |
| GAMMA5, GAMMA9           | one hand across   | 29.5 cm                       |
| Same-side and beta pairs | close together    | 3.5 cm                        |
| ALPHA2, ALPHA3, GAMMA1   | uncrossed         | 0                             |

The figures are identical on all three rigs because the rule works in grid
geometry. The 90th-percentile gap is 23.3/24.4 cm today, 18.0/18.4 with the
wrist fix, and 10.5/12.1 with the split also removed. Removing the split
alone brings forearms within 4 cm on 331 to 350 of 6,480 pair-frames, so it
must be replaced, not deleted.

## Clipping

The probe never brought forearms within 25 cm or palms within 18.8 cm.
Austen's answer explains why: nothing visibly clips today because the hands
let go first.

> "if I were to bring the hands to the props and make them hold the props
> they would have to clip in order to make it happen because it doesn't know
> anatomically how to treat the rest of the body like something that can
> allow you to find that space such as negative space behind the head space
> under the leg space left and right"

He also noted that hands pass through the prop "all the time because there's
not anything to prevent that." So the clipping to measure is the staff
passing through the arms, head and torso once contact is enforced, and the
missing model is the body's negative space, not arm-to-arm contact.

## How the per-frame code fights itself

The default path runs about twelve passes per frame with no shared goal. The
last writer is the render lock, which keeps the staff on its grid point, so
the staff wins and the hand loses.

1. Un-cross the hands (`separateAdjacentGripTargets`): up to 55.5 cm off the
   staff, and hides crossings from step 6.
2. Spine twist toward the staffs: up to 87 to 90° in the spine, hips square.
3. Stance correction: measures and removes the twist from step 2.
4. Clavicle raise: only when the host enables it.
5. Wrist placement for palm-inward: cause 1, disagrees with step 10.
6. Elbow poles including over/under: never sees a crossing.
7. Reach help: clavicle up to 12°; lean and pitch run but are fixed at 0.
8. Clearance retraction: down to 0.6 arm length, cached, not reset on seek.
9. Blend with animation and solve again.
10. Wrist twist, palm normal inward: rate-limited and smoothed 25% per frame,
    so it behaves differently at different frame rates.
11. Render lock: slides the staff up to 6 cm toward the hand without rotating
    it. Absent in the orbit-camera (worker) renderer.
12. Collision check: measures overlap and changes nothing.

There are three contact modes: `legacy` (every production host), weld (three
test routes) and `prop-authoritative` (grip lab only, one hand). A win in one
does not carry to the others.

## The grip-elbow worktree

This review parked `codex/grip-elbow-continuity`; another session merged it
to local main on 2026-09-25. The assessment stands as a record: it touches
none of the three causes and runs only in the grip lab's strict mode. Palm
roll is a curve for one right-hand exercise, clamped so it cannot mirror, and
a hand-sculpt step moves bones after they are measured. Worth keeping from
it: the relaxed thumb-and-index pinch shapes (after the ring and pinky splay
are mirrored), the scrub-equals-play tests, and Austen's taught North pose
values as defaults for their route.

## Keep and stop

Keep: Austen's spoken reach notes as the source of truth; planning against
score time (the stance track already plans the whole sequence); the leg
`ContactRetargeter` bake as the template for arms; measured per-rig geometry;
honest gates with failing evidence on record; the 26-sequence corpus; thumb
and pinky ends that never swap.

Stop: moving hands off staffs to avoid clipping; adding per-frame rules;
disabling behaviour by setting a constant to 0 while its code still runs;
lab-only contact modes; tests that read source text or pin the constants that
cause the let-go; merging work whose own gates fail; several sessions changing
the performer at once; per-phase hand poses for one exercise; treating old
memory notes as design authority.

## Austen's answers (2026-09-24)

Full quotations are in §10 of
[negative-space-and-wall-plane-reach.md](../reference/negative-space-and-wall-plane-reach.md).

| Question                         | Answer                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Where is the clipping?           | Nothing visibly clips; hands would clip if forced onto the props, because the solver has no model of negative space.      |
| Why are hard beats out of reach? | A combination of everything. Each situation must be mapped with him; choices cascade across beats and hands.              |
| How far may a staff drift?       | Along its own radial line, in or out. Never angularly toward a neighbouring point.                                        |
| Is depth free?                   | Yes, freely.                                                                                                              |
| Which side is East?              | The performer's right. Blue at East with red at West is the crossed case. This matches the current code.                  |
| Which arm goes under in B?       | Needs mapping. Facing the audience, the hand sneaks around on a concave path rather than an arc.                          |
| Beta pairs at North?             | One hand must be closer to the audience. Which one depends on orientation (which end is inside). Level 3 has its own map. |
| How are routes chosen?           | Two families, negative space and body turns, plus blends of both. Needs a deep dive before building.                      |
| Pro 0-turn inner end             | Nearly still; slight drift is fine.                                                                                       |
| Wall or wheel under a turn       | Both frames matter: audience-fixed and performer-relative.                                                                |
| Thumb-and-index pinch            | Both deliberate and forced when the wrist runs out of turn.                                                               |
| 2026-09-21 merge                 | Does not remember.                                                                                                        |
| Retire the lab-only mode         | Decide later.                                                                                                             |
| Reference clips                  | Yes, soon.                                                                                                                |

### Corrections to the earlier framing

The first version of this review listed "full extension" as a route. It is
not a solving strategy. §5 of the reach notes describes what the arm is forced
into when negative space is not used. The solving families are:

- **Negative space:** above or below the arm and shoulder, above or behind the
  elbow, behind the head, under the leg, and on either side of the body.
- **Body turns:** rotating the torso, the legs, or all the way around on the
  floor so the negative space opens on the other side of the body.
- **Blends:** moves that use both, where it is unclear which is doing the work.

The crossed-weave "sneak around" path in B (§2 of the reach notes) is a
negative-space move with a concave rather than circular path.

### What the answers change

- **Displacement rule.** A hard beat may move its staff and hand together
  along the staff's own radial line (in toward the centre or out) and in depth
  (toward or away from the audience). It may never move the staff angularly
  toward a neighbouring grid point. This replaces the earlier "in toward the
  body" wording and the `prop-authoritative` claim that the prop target is
  immutable (`contact-correct-performers.md`, ordered solve step 6), which
  still needs reconciling.
- **Beta depth lanes.** Two hands at the same point get separate depth lanes.
  Which hand is downstage depends on orientation and is not yet mapped, so the
  first implementation picks a deterministic default and reports it.
- **The East convention is settled.** Crossed and uncrossed decisions can rely
  on East = performer's right.
- **Clipping becomes a scoreboard measure.** Step 0 measures staff-versus-arm,
  head and torso distance with the hands on the staffs, not just forearm to
  forearm.
- **Routes wait for mapping.** Step 5 cannot be designed from code. It needs
  Q&A mapping sessions with Austen that build a finite situation map: per beat
  and hand, which negative-space pocket or turn is used, and how that choice
  constrains the next beats. His framing is that the branches "all seem to
  converge around A trunk of the sequence itself, Which is what the notation
  in the kinetic alphabet communicates and codifies."
- **Plane frames are dual.** A wall-plane move with the head or body turned
  stage left or right is a wheel-plane move in the performer's own frame. The
  planner must carry both frames rather than pick one.

## Plan

Every step is judged by the same scoreboard. Effort figures are estimates.

| Step | Change                                                                                                                                                                            | Gate                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Scoreboard: commit the probe as a corpus test; add staff-versus-arm, head and torso distance                                                                                      | Reproduces today: 8,068 of 12,960 over 3 cm on ch07; 0 forearm pairs under 4 cm                                                                      |
| 1    | Wrist fix: place the wrist from the orientation the twist will produce                                                                                                            | At most 4,400 of 12,960 over 3 cm on ch07 and ch18; forearms under 4 cm stay 0; palms under 6 cm at most 10 per rig; browser check on both renderers |
| 2    | Hard beats: replace the unbounded split with a capped, reported displacement of staff and hand together, radial and depth only; beta depth lanes; reset cached retraction on seek | p90 gap at most 12 cm on both rigs; forearms under 4 cm stay 0; every displaced beat listed in cm within the cap                                     |
| 3    | Move scene-3d out of the pnpm patch into `packages/` (the camera-3d precedent)                                                                                                    | Scoreboard identical before and after; type check and build pass                                                                                     |
| 4    | Planning trial: plan elbow direction across the worst remaining sequence instead of per frame                                                                                     | At least 50% fewer gap frames than step 2 on that sequence and forearms under 4 cm back to 0; otherwise stop and keep step 2                         |
| 5    | Routes and palm facing from the mapping sessions: negative-space pockets, body turns and blends, chosen per beat across the sequence                                              | Austen signs off the route rules; the negative-space filmstrip shows the thumb end in the pocket at 25% and 35%                                      |
| 6    | Grip states: the relaxed pinch as a real state on both hands, entered deliberately or when the wrist runs out of turn                                                             | Both hands, four rigs; contact holds in both grips; displayed hand equals measured hand                                                              |
| 7    | Delete the legacy per-frame rules, extra contact modes and render lock once the planned path is default (lab-mode retirement pending Austen's decision)                           | Old passes gone; no test reads source text; earlier gates hold                                                                                       |

The architecture reviewer wanted step 3 first and the animation reviewer
wanted a full offline optimizer first. The red team moved both after the
wrist fix: the fix is small, the patch can carry it, and an optimizer built on
the wrong wrist placement would optimise against a wrong model.

## Results (2026-09-25)

Steps 0 to 2 are on local main, not pushed. The scoreboard is
`tests/unit/3d/performer-contact-scoreboard.test.ts`, full corpus, ch07 then
ch18:

| Measure                                       | Step 0 (before) | Step 1        | Step 2        |
| --------------------------------------------- | --------------- | ------------- | ------------- |
| Hand-frames over 3 cm from the staff (12,960) | 8,068 / 8,282   | 3,858 / 4,134 | 1,787 / 2,362 |
| 90th-percentile hand-to-staff gap             | 23.3 / 24.4 cm  | 18.1 / 18.5   | 3.9 / 5.7     |
| Forearm pairs under 4 cm                      | 0 / 0           | 0 / 0         | 75 / 34       |
| Palm pairs under 6 cm                         | 0 / 0           | 8 / 4         | 7 / 3         |
| Rendered staff through head, torso or arm     | 60 / 49         | 136 / 157     | 73 / 73       |
| The same before the hard-beat move and lock   | not measured    | 70 / 83       | 65 / 72       |

Step 1 turned the wrist from the orientation the twist produces. Step 2
replaced the unbounded pair split with a capped displacement of staff and
hand together: at most 25 cm in toward the grid centre, never out, and depth
lanes of up to 10 cm per hand. Every displaced beat is listed in cm. The
displacement runs in both renderers, a seek resets the animator's contact
history, and the worker renderer now applies the same 6 cm render lock as the
main-thread one. The browser check ran on `/composer` with both renderers
loading the patched package.

Decisions and open items:

- **Forearms.** Step 2 misses "forearms under 4 cm stay 0". Austen accepted
  the merge with the count capped at 75 and 34. The old 0 came from the split
  pulling the hands off their staffs. The remaining contacts are elbow against
  elbow near the midline on crossed and close pairs; a wider depth lane does
  not close them. Step 4 takes the cap back to 0. The time-based recovery
  raised the caps to 97 and 68 on 2026-09-27
  ([Clearance fixes](#clearance-fixes-2026-09-27)).
- **Render lock.** It still slides the staff up to 6 cm in any direction,
  against the radial-and-depth rule. A lock limited to radial and depth moves
  raised the frames over 3 cm to 2,556 and 3,154. Kept until step 7.
- **Staff through the body** is above step 0 (73 against 60 and 49). An
  earlier version said the grid positions alone account for 65 and 72 of
  those frames. That was wrong: those staffs already sit where the torso
  turn's corridor puts them, and held square the grid never reaches the body.
  These counts also come from the package's collision spheres, which put the
  face behind the head, miss the front of the chest and ignore the turn. The mesh measure in
  [Physical check](#physical-check-2026-09-25) replaces them.
- **Elbow routing.** The displacement changes the over/under routing on 368
  frames (capped); the plan asked for none.
- **Hosts left on the legacy split** until they are wired: Coven, Learn
  preview, Quiz, two Museum hosts, Village, the character card, walk-lab and
  the grip lab.
- **Stance cache.** Fixed on 2026-09-25. The torso track in
  `performer-upper-body-stance.ts` now keys on the same score motion as the
  hard-beat track, through the shared `performer-score-motion-key.ts`: steps,
  plane mode, step count, loop, effort, effort timeline, path shape and
  motion-aware paths. An effort or path change replans the torso and the
  displaced props together.

## Physical check (2026-09-25)

Austen asked for realism next: a staff at the South point flies through the
torso when the body turns side-on. He chose to measure honestly first, then
keep each staff out of the body without capping the turn, and to have the
hips and feet carry the turn later, like a real spinner: the chest leads,
then the hips and feet pivot. That is a separate, larger piece built on the
walking system. Until it lands the scoreboard reports the spine twisted past
the pelvis instead of blocking it.

What changed:

- **Measured against the body.** The scoreboard now measures each staff
  against the rig's own skinned mesh: head, torso, legs, the other hand's arm,
  and the holding hand's upper arm and forearm. Where the stance plans them,
  with the body held square, no staff touches the head or torso on either
  rig. Most head and torso hits come from the chest turning side-on, up to
  87°. The rest happen with the chest square and come from hard-beat
  displacement and the render lock: head hits in the together-opposite
  sequences and fx-phi-psi, mostly at step 2 (ch07 40 of 52 head frames,
  ch18 92 of 141), and 5 ch18 torso frames at tog-opp-ekek step 3.
- **Timing.** The torso turn read the raw clock, which already runs through
  beat 1 during the static start pose, so the torso turned through beat 1 and
  snapped back as it began. The torso now holds where beat 1 starts, and it
  reads the same clock as the displaced props in both renderers.

Staffs still pass through the chest when it turns side-on (642 / 1,271
staff-frames as drawn, ch07 / ch18). The scoreboard holds them at those
counts. The per-hand lanes and the 60° chest limit below were two attempts to
clear them. Both were dropped. The real staff recheck below traces most of
this contact to staff length.

Recommended order after this: trail cleanup; reference clips from Austen
(front and side stills he confirms) for body turns and negative space,
starting with the together-opposite, split-same and quarter families; then
elbow planning (step 4). Step 3 does not block any of them.

### Tried and dropped: a lane for each hand

When the chest turns side-on, the corridor moves both grips to one 16 cm
depth lane. The turned chest is wider than that, so a staff held upright at
South runs through it. The attempt gave each hand its own lane, opened per
moment of the score, up to 26 cm, until its staff came no further into the
head and torso than with the chest square. The check read a stack of rounded
boxes measured from both rigs and turned with the spine.

Scoreboard, ch07 / ch18, staff-frames of 12,960 unless noted:

| Measure                                   | Merged        | Each hand's lane |
| ----------------------------------------- | ------------- | ---------------- |
| Staff through the torso, as drawn         | 642 / 1,271   | 100 / 181        |
| Staff through the head, as drawn          | 64 / 149      | 52 / 141         |
| Head and torso where the stance plans it  | 1,189 / 1,610 | 72 / 103         |
| Staff through a leg                       | 20 / 21       | 17 / 17          |
| Staff through the other hand's arm        | 628 / 637     | 662 / 668        |
| Staff through its own upper arm           | 1,908 / 1,848 | 2,751 / 2,710    |
| Staff along or through its own forearm    | 2,886 / 2,666 | 3,732 / 3,436    |
| Hand-frames over 3 cm from the staff      | 1,787 / 2,362 | 1,860 / 2,446    |
| 90th-percentile hand-to-staff gap         | 3.9 / 5.7 cm  | 4.0 / 6.0 cm     |
| Forearm pairs under 4 cm (of 6,480)       | 75 / 34       | 73 / 33          |
| Chest over 60° past the pelvis (of 6,480) | 2,633 / 2,614 | 2,639 / 2,615    |

The counts improved where the lanes aimed, and the pose got worse. Side by
side at gggg beats 1 and 2, the lane pulled one arm back behind the head,
where its hand and staff dropped out of sight, and laid the other staff along
its own forearm. Without the lanes the pose reads as two arms reaching
together, with one staff through the face. Austen rejected the lanes on
2026-09-26 from those pictures, and they were reverted before the merge.
Commit `2dd227ba5f` and its follow-ups hold the work if elbow planning makes
it worth another look. Judge the next attempt from pictures of the whole pose
before the counts: a contact count can fall while the pose gets worse.

### Tried and dropped: holding the chest to 60°

Nothing turns the hips or feet yet, so the whole side-on turn is spine twist,
up to 87°. This attempt capped the planned turn at 60° with one clamp in
`planUpperBodyStanceYawTarget`, so the timing curve and the corridor both saw
the smaller turn.

Scoreboard, ch07 / ch18, staff-frames of 12,960 unless noted:

| Measure                                   | Merged        | Chest held to 60° |
| ----------------------------------------- | ------------- | ----------------- |
| Staff through the torso, as drawn         | 642 / 1,271   | 136 / 269         |
| Staff through the head, as drawn          | 64 / 149      | 119 / 201         |
| Head and torso where the stance plans it  | 1,189 / 1,610 | 0 / 0             |
| Staff through a leg                       | 20 / 21       | 0 / 0             |
| Staff through the other hand's arm        | 628 / 637     | 1,131 / 1,332     |
| Staff through its own upper arm           | 1,908 / 1,848 | 628 / 627         |
| Staff along or through its own forearm    | 2,886 / 2,666 | 2,215 / 2,090     |
| Hand-frames over 3 cm from the staff      | 1,787 / 2,362 | 2,405 / 3,423     |
| 90th-percentile hand-to-staff gap         | 3.9 / 5.7 cm  | 4.7 / 6.8 cm      |
| Forearm pairs under 4 cm (of 6,480)       | 75 / 34       | 430 / 380         |
| Chest over 60° past the pelvis (of 6,480) | 2,633 / 2,614 | 2,379 / 2,282     |
| Largest chest twist past the pelvis       | 88° / 87°     | 75° / 75°         |

Two things kept the pose from following the plan. The package animator steers
the chest from the shoulder line, so the ribcage still reached 75° while the
plan held 60°. The corridor also opens its depth lanes only past about 70°
(0.8 of the 87° side-on turn), so below that the together-same hands land on
one point and the arms stack. Forearm pairs under 4 cm rose from 75 to 430 on
ch07.

Pictures of the same moments, before and after:

- Better at gggg beats 1 and 2: both staffs leave the neck and chest.
- Worse at gggg beat 4 and hhhh beat 1: the forearms cross in front of the
  face and the hands open away from their staffs.
- Wrong both ways at vvvv beat 4: the limited pose lays a staff across the
  neck with the hand open. The current pose looked like it put a staff through
  the mouth, but that piece was the notation staff's T-bar crossbar. With the
  LED Baton the shaft stops at the lips, and the scoreboard counts no head hit
  at that beat.

Austen dropped the limit on 2026-09-27 from those pictures. It was never
committed.

### Staff builds for realism work

The red and blue staff with the T-bar end is a notation marker. Its shape and
body-fit length serve the notation, and nobody spins that prop, so it cannot
show whether a real staff clears the body. Realism and collision work, and the
pictures that judge it, use the Fire Staff or the LED Baton, or a day staff
once one is modeled. The staff-grip lab opens on the LED Baton, so leave
`prop=staff` off its URL. The pictures for both attempts above drew the
notation staff. The scoreboard measures a straight 86.36 cm staff (the default
34-inch length) whatever build is drawn, which matches the LED Baton's length.

Judge a real build at the staff length the performer uses. The LED Baton
always draws at 86.36 cm. Since 2026-09-27 the Fire Staff stretches to the
length it is given, so in the lab's default body-fit mode it draws at the hug
fit (about 67 cm on ch07). Pin `length=` in the lab URL to the length under
test.

### Real staff recheck (2026-09-27)

Today's merged pose, pictured with the LED Baton at 86.36 cm and the Fire
Staff pinned to 90 cm at the moments used above. Both builds read the same way:

- gggg beat 1: the red end reaches the face and the blue end the collar.
- gggg beat 2: the inner ends of both staffs come out at the collarbone.
- gggg beat 4: the red staff lies across the face with its end at the neck.
- hhhh beat 1: the red staff's top end passes just over the head.
- vvvv beat 4: the red end stops at the lips.

The lab's fit panel gives about 67 cm (67.0 to 67.7 cm across loads) as the
longest staff ch07 can hold inside its own hug: half of it fits between the
converged grip and the torso surface with 6 cm to spare. The test ran the
scoreboard on today's poses at five staff lengths with nothing else changed.

Scoreboard, ch07 / ch18, staff-frames of 12,960:

| Staff length         | Torso, as drawn | Head, as drawn | Head and torso where the stance plans it |
| -------------------- | --------------- | -------------- | ---------------------------------------- |
| 61 cm                | 55 / 82         | 64 / 142       | 136 / 206                                |
| 67.6 cm (hug fit)    | 86 / 188        | 64 / 142       | 256 / 448                                |
| 76 cm                | 216 / 613       | 64 / 147       | 650 / 968                                |
| 86.36 cm (LED Baton) | 642 / 1,271     | 64 / 149       | 1,189 / 1,610                            |
| 90 cm (Fire Staff)   | 984 / 1,508     | 64 / 149       | 1,506 / 1,948                            |

With the body square to the audience, no length puts a staff in the head or
torso. At the LED Baton's length, 517 of 642 torso hits on ch07 and 1,053 of
1,271 on ch18 fall in beats where the chest turns past 80°. At the hug-fit
length, torso hits as drawn fall 87% on ch07 and 85% on ch18. Head hits
barely move (64 at every length on ch07, 142 to 149 on ch18), so the staff
meets the head within about 30 cm of the hand, not at its ends.

Most of the side-on chest contact is staff length. Today's grips leave room
for a half-length of about 34 cm in front of the turned chest, and the real
builds reach 43 to 45 cm from the hand. Austen's answer, 2026-09-27:
performers use smaller staffs sized to their bodies, and the grid follows
either the staff or the body. [Performer grid styles](performer-grid-styles.md)
holds that design.

## Clearance fixes (2026-09-27)

The arm-from-body clearance (cause 2) had two more defects. The slow recovery
is fixed. The face sphere is parked until elbow planning (step 4).

### Landed: the reach grows back by time

A hand the clearance pulls in used to regain 4% of its reach every 12 frames.
From 0.6 that took about 2 s at 60 fps and 4 s at 30, so a hand stayed off its
staff long after the body was out of the way. It now grows back to full length
in 0.3 s at any frame rate, and each longer reach must still clear the body.
`avatar-clearance-recovery.test.ts` times the return at 30 and 120 fps.

Scoreboard, ch07 / ch18:

| Measure                                                    | Before         | Time-based     |
| ---------------------------------------------------------- | -------------- | -------------- |
| Hand-frames over 3 cm from the staff (12,960)              | 1,787 / 2,362  | 1,735 / 2,308  |
| The same in fx-phi-psi                                     | 13 / 18        | 0 / 5          |
| 90th-percentile hand-to-staff gap                          | 3.85 / 5.71 cm | 3.81 / 5.69 cm |
| Forearm pairs under 4 cm (of 6,480)                        | 75 / 34        | 97 / 68        |
| Forearm pairs under 8 cm                                   | 350 / 285      | 365 / 316      |
| Staff through the head, as drawn                           | 64 / 149       | 64 / 149       |
| Staff through the torso, as drawn                          | 642 / 1,271    | 644 / 1,273    |
| Forearm within 4 cm of the head or neck (probe, of 12,960) | 726 / 775      | 750 / 816      |

The arms reach the midline sooner, so the forearms meet more, mostly at
tog-opp DJ, EK and FL step 3. Austen approved nine higher caps that day:
forearms under 4 cm 97 and 68, under 8 cm 365 and 316, torso 644 and 1,273,
ch07 other arm 642 and own forearm 2,912, and ch18 palms 4. The other caps
moved down to the new counts.

Pictures with the LED Baton, before and after:

- fx-phi-psi beat 1.05 (ch07): before, the upper hand hovers at the forehead
  8.0 cm off its baton, still pulled in from the beat before. After, the arm
  reaches up and holds the baton overhead. The baton crosses the face in both.
- Quarter-opp NQ beat 2.52 (ch07) and tog-opp DJ beat 3.25 (ch18): the same
  pose, with each gap within 1.4 cm of before.
- Tog-opp EK beat 3.10 (ch07): the forearms lie folded across the chest in
  both, with the hands just below their batons. One gap falls from 6.2 to
  3.6 cm and the other rises from 3.5 to 4.0 cm.

The crossed-arm beats where the forearm count rose look as they did: the
forearms already lay across each other there.

### Parked: the face sphere

The package's `computeFaceCenter` (`BodyCollisionGeometry.ts:22`) builds
forward as (−right.z, 0, right.x), with right = right shoulder − left
shoulder. The shipped rigs face +Z with the left shoulder at +X, so that
vector points backward and the face sphere sits about 8 cm behind the head.
At an 87° chest turn a probe put the package's face at (−0.075, 1.729,
−0.001) and the real face at (0.077, 1.729, 0.037). The arm clearance in
`AvatarAnimator.refreshFaceClearanceCenter` and `Avatar3D.svelte` pulls the
arms back from that point. The collision lab's `stance-simulator.ts` copies
the formula, but every body it gets puts the right shoulder at +X, so its copy
points forward and stays as it is.

The trial took forward from the Head bone's +Z, flattened, with up × (right −
left) as the fallback. It followed the pending stance head lag, and
`Avatar3D.svelte` used the rendered Head quaternion. The keep variant held
full reach on the original pole when no shorter reach cleared. Scoreboard and
probe, ch07 / ch18:

| Measure                                 | Before        | Face only     | Time-based    | Face + time   | Face + time + keep |
| --------------------------------------- | ------------- | ------------- | ------------- | ------------- | ------------------ |
| Hand-frames over 3 cm from the staff    | 1,787 / 2,362 | 2,281 / 2,785 | 1,735 / 2,308 | 2,050 / 2,619 | 1,738 / 2,377      |
| 90th-percentile gap (cm)                | 3.85 / 5.71   | 5.11 / 6.64   | 3.81 / 5.69   | 4.66 / 6.42   | 3.89 / 5.56        |
| Forearm pairs under 4 cm                | 75 / 34       | 166 / 149     | 97 / 68       | 155 / 137     | 156 / 131          |
| Forearm pairs under 8 cm                | 350 / 285     | not run       | 365 / 316     | 473 / 405     | 392 / 351          |
| Staff through the head, as drawn        | 64 / 149      | not run       | 64 / 149      | 70 / 155      | 65 / 155           |
| Staff through its own upper arm         | 1,908 / 1,848 | not run       | 1,905 / 1,825 | 1,992 / 1,909 | 1,954 / 1,871      |
| Forearm within 4 cm of the head or neck | 726 / 775     | 279 / 371     | 750 / 816     | 280 / 388     | 264 / 383          |
| Forearm inside the head or neck         | 189 / 173     | not run       | 185 / 173     | 148 / 124     | 143 / 121          |

With the face in front, the arms stop passing through it. Forearm frames
within 4 cm of the head or neck fall from 750 to 280 and 816 to 388, and the
face contacts in split-same A, B and C and fx-aaaa go to 0 (from 55, 52, 53
and 49 frames on ch07 and 28, 22, 34 and 38 on ch18). The clearance can only
pull the hand in, though, and the real face sits where the hands pass.
Without keep, the worst beats become quarter-same T, S, V and U, 21 to 24 cm
off the staff on ch07 and 23 to 28 cm on ch18, against 17.4 and 20.6 cm
before either fix. Keep brings the gap count back near the time-based one but
still moves hands 4 to 8 cm off their staffs at those beats, and it raises
forearm pairs under 4 cm to 156 and 131. Against the caps before the timing
fix it would have needed 13 raised. The face fix also failed the Grip Lab
checkpoint test for seek order, with a clearance of −7.5 mm.

Moving hands off staffs to avoid clipping is on the stop list, and this
clearance has no other way around the face. Elbow planning (step 4) can route
the elbow around it instead, so the fix waits for that step. The trial's
pictures drew the notation staff; picture any second attempt with the LED
Baton.

## Target architecture

Plan the whole sequence ahead of time, the way a pianist chooses fingering for
notes that are already written. The hand always holds the staff. The staff may
move in depth and along its radial line within a cap, and every such move is
reported. Each beat picks a route from the families above, with palm facing as
part of the route (§6 of the reach notes). Taught poses become route defaults
that mirror to the other hand. Playback samples the planned curves, so a scrub
lands on the same pose as playing through. The leg `ContactRetargeter` already
bakes contact-preserving poses this way; the arm problem is about 12 to 27
numbers per moment (estimated).

Motion capture helps later: video-to-body tools give torso and elbow timing
but not staff contact, wrist roll or fingers. Austen's short reference clips
are useful now.

## Other findings

- The 0.52 m grid radius assumes an 86 cm staff; the sequence performer draws
  about 67 cm and collision uses 86 cm. Pro 0-turn isolations cannot keep the
  inner end nearly still until this agrees.
  [Performer grid styles](performer-grid-styles.md) plans the fix.
- Beta staffs overlap in 3D; the 2D pictograph offsets them.
- Turns are all spine (up to 87 to 90° with square hips); a human spine
  rotates roughly 40 to 50° (general estimate).
- The orbit-camera renderer has no contact lock, so the same sequence looks
  different depending on which renderer draws it. (Fixed in step 2.)
- `avatar-head-clearance-policy.test.ts` pins lean at 0 and the 0.6
  retraction; nine test files read source text.
- 13 patch commits since 2026-09-17 came from at least four branches.
- App and package constants disagree: stance turn 87° vs 90°, stagger 22° vs
  25°, head lag 30° vs 34°.
- Wrist to palm is 9 to 11 cm on these rigs, not the 5 to 6 cm earlier
  estimates used.

## Code locations

Paths under `scene-3d` refer to
`node_modules/@austencloud/scene-3d/src/lib/services/implementations/` as
installed from `patches/@austencloud__scene-3d@0.1.6.patch`.

| Finding                            | Location                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Wrist placed for palm-inward       | `AvatarAnimator.ts:2281-2389` (`computeHandDirection`, `computeSocketTarget`) |
| Twist turns the palm normal inward | `AvatarAnimator.ts:2754-2775` (`applyWristOrientation`); hug knee `:83`       |
| Un-crossing split, 7 cm minimum    | `AvatarAnimator.ts:473-510`, `:71`                                            |
| Over/under routing                 | `ElbowPoleComputer.ts:75-102`, called at `AvatarAnimator.ts:1627`             |
| Lean and pitch fixed at 0          | `AvatarAnimator.ts:98`, `SpineTwister.ts:53`                                  |
| Retraction and its cache           | `AvatarAnimator.ts:97-108`, `:174-175`, `:607-609`, `:2647-2830`              |
| Wrist rate limit and smoothing     | `AvatarAnimator.ts:60`, `:2744-2752`, `:2848`                                 |
| Render lock, 6 cm                  | `Avatar3D.svelte:529`, clamp `:652`, applied `:1663`, `:1670`, report `:1886` |
| Orbit renderer without lock        | `worker-performer.ts:436-491`; routing `Viewer3DCanvas.svelte:346-385`        |
| Grid radius                        | `plane-transforms.ts:34`                                                      |
| Split pairs flattened, depth jump  | `upper-body-stance-planner.ts:127-160`, `:211-217`                            |
| Concave paths off in 3D            | `prop-state-interpolator.ts:33`                                               |
| Lab-only strict path               | `AvatarAnimator.ts:718-1007`; host `ContactIsolationPerformer.svelte:69`      |
| Tests pinning the constants        | `tests/unit/3d-animation/avatar-head-clearance-policy.test.ts:37-45`          |
| Acceptance tests outside CI        | `package.json:69-70`                                                          |
| Leg bake template                  | `ContactRetargeter.ts:102-140`                                                |
