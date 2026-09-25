# Performer contact review

Status: review, 2026-09-24. Read-only findings, Austen's answers, and the
agreed plan. Steps 0 to 2 are approved for implementation; later steps wait
on the mapping sessions described below.

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
persist about two seconds after a scrub (computed).

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

## The grip-elbow worktree: parked

Do not merge `codex/grip-elbow-continuity` and do not delete it. It touches
none of the three causes; it runs only in the grip lab's strict mode. Palm
roll is a curve for one right-hand exercise, clamped so it cannot mirror; a
hand-sculpt step moves bones after they are measured; and merging requires
regenerating the patch against newer `main` commits, the operation behind all
five clobbers. Worth keeping: the relaxed thumb-and-index pinch shapes (after
the ring and pinky splay are mirrored), the scrub-equals-play tests, and
Austen's taught North pose values as defaults for their route.

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
| 3    | Move scene-3d out of the pnpm patch into `packages/` (the camera-3d precedent); keep grip-elbow parked                                                                            | Scoreboard identical before and after; type check and build pass                                                                                     |
| 4    | Planning trial: plan elbow direction across the worst remaining sequence instead of per frame                                                                                     | At least 50% fewer gap frames than step 2 on that sequence, no new contacts under 4 cm; otherwise stop and keep step 2                               |
| 5    | Routes and palm facing from the mapping sessions: negative-space pockets, body turns and blends, chosen per beat across the sequence                                              | Austen signs off the route rules; the negative-space filmstrip shows the thumb end in the pocket at 25% and 35%                                      |
| 6    | Grip states: the relaxed pinch as a real state on both hands, entered deliberately or when the wrist runs out of turn                                                             | Both hands, four rigs; contact holds in both grips; displayed hand equals measured hand                                                              |
| 7    | Delete the legacy per-frame rules, extra contact modes and render lock once the planned path is default (lab-mode retirement pending Austen's decision)                           | Old passes gone; no test reads source text; earlier gates hold                                                                                       |

The architecture reviewer wanted step 3 first and the animation reviewer
wanted a full offline optimizer first. The red team moved both after the
wrist fix: the fix is small, the patch can carry it, and an optimizer built on
the wrong wrist placement would optimise against a wrong model.

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
- Beta staffs overlap in 3D; the 2D pictograph offsets them.
- Turns are all spine (up to 87 to 90° with square hips); a human spine
  rotates roughly 40 to 50° (general estimate).
- The orbit-camera renderer has no contact lock, so the same sequence looks
  different depending on which renderer draws it.
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
| Retraction and its cache           | `AvatarAnimator.ts:102-106`, `:167-170`, `:251-254`                           |
| Wrist rate limit and smoothing     | `AvatarAnimator.ts:60`, `:2744-2752`, `:2848`                                 |
| Render lock, 6 cm                  | `Avatar3D.svelte:510`, clamp `:633`, report `:1857`                           |
| Orbit renderer without lock        | `worker-performer.ts:436-491`; routing `Viewer3DCanvas.svelte:346-385`        |
| Grid radius                        | `plane-transforms.ts:34`                                                      |
| Split pairs flattened, depth jump  | `upper-body-stance-planner.ts:127-160`, `:211-217`                            |
| Concave paths off in 3D            | `prop-state-interpolator.ts:33`                                               |
| Lab-only strict path               | `AvatarAnimator.ts:718-1007`; host `ContactIsolationPerformer.svelte:69`      |
| Tests pinning the constants        | `tests/unit/3d-animation/avatar-head-clearance-policy.test.ts:37-45`          |
| Acceptance tests outside CI        | `package.json:69-70`                                                          |
| Leg bake template                  | `ContactRetargeter.ts:102-140`                                                |
