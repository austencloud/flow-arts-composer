# Staff turn-preparation study

Status: offline experiment. No runtime turn planner has been adopted from it.

This study asks one narrow question: for an authored double-staff loop, does
shifting one fixed, smooth root-yaw pulse earlier reduce the upper-body proxy's
whole-cycle error? It does not alter the score, prop path, grip, renderer,
controller, or package patch.

## Method

Ownership search used `stance`, `trajectory`, `computeStanceLoss`, and
`optimizeSweep`. The closest existing owners were the stance simulator,
stance optimizer, and swept-volume builder. This study reuses their collision
evaluation and extends the builder with a shared state-to-staff conversion.
The new evaluator only compares authored timing candidates offline.

The source is the real eight-step `FALG` fixture from `ALL_FIXTURE_LOOPS`. The
proxy uses `restPoseFromHeight(1.7)` (a 1.7 m body) and the canonical 0.86 m
staff segment (0.43 m from grip to either tip).
`CharacterInstanceState.propStatesAtScoreTime` supplied both production prop
interpolation states at 0.025-step intervals (320 frames). These preserve the
renderer-owned interpolation, including any authored motion configuration such
as concave depth, but precede stance-depth and contact-lock corrections. The
evaluator snapshots them once before scoring every scenario, converts them
with the canonical `propStateToStaffTarget` helper from the swept-volume
builder, and evaluates the unchanged rigid staff segments with
`StanceSimulator` and `computeStanceLoss`.

The baseline is deliberately **neutral root only**: no yaw, no root offset,
and no depth corridor. It is a simplified geometry baseline, not a claim about
the current renderer, which also composes the stance track and hand-depth
corridor. Every turn candidate is the same +45 degree C1 raised-cosine pulse:
0.75 steps turning, 0.75 holding, and 0.75 returning. Only its start time
changes. The finite comparison set was fixed at six starts (0.00 through 2.50
in 0.50-step increments); it was not expanded to force an early-win result.

The reported depth integral is sampled collision depth times score-time spacing
(m·steps), so it remains comparable if the sampling density changes. Mean depth
is the same error averaged across all 320 sampled frames. `strictClear` means
only zero reported reach gap and zero reported collision; it does not mean
physical feasibility.

## Result

| root-yaw pulse start  | collision frames | collision events | depth integral (m·steps) | mean depth (m) | max depth (cm) | max reach gap (cm) | summed stance loss | seam value / velocity difference |
| --------------------- | ---------------: | ---------------: | -----------------------: | -------------: | -------------: | -----------------: | -----------------: | -------------------------------: |
| neutral root baseline |              306 |            1,102 |                    0.803 |         0.1004 |           8.92 |              23.34 |             98,174 |                            0 / 0 |
| 0.00                  |              307 |            1,002 |                    0.760 |         0.0950 |          11.27 |              24.97 |             93,850 |             0 / 0.00034 rad/step |
| 0.50                  |              303 |            1,052 |                    0.755 |         0.0944 |          12.28 |              25.51 |             94,466 |                            0 / 0 |
| 1.00                  |              290 |            1,008 |                    0.738 |         0.0923 |           8.92 |              23.61 |             94,737 |                            0 / 0 |
| 1.50                  |              282 |            1,033 |                    0.732 |         0.0915 |           8.92 |              23.34 |             93,842 |                            0 / 0 |
| **2.00**              |          **283** |        **1,016** |                **0.723** |     **0.0904** |       **8.92** |          **23.34** |         **93,342** |                        **0 / 0** |
| 2.50                  |              300 |            1,067 |                    0.797 |         0.0996 |          10.65 |              23.34 |             95,430 |                            0 / 0 |

No candidate was strict-clear. The best bounded timing by loss and depth
integral starts at 2.00, later than the starts tested before it. It reduces the
proxy depth integral by about 10% and summed loss by about 4.9%, while leaving
the 23.34 cm worst reach shortfall. That is negative evidence for this fixture:
timing a root-yaw pulse alone does not solve its locked upper-body geometry,
and this sweep does not support the claim that earlier preparation is always
better.

The existing staff-grip lab gave a separate live observation on normalized
Jade ch07 at `fx-falg` phase 7.99: both contact offsets were 0 mm, the
palm-to-authored distances were 136.74 / 132.99 mm, and collision count was
zero. That observes attachment after the live rig's composition; it neither
validates nor contradicts this offline trajectory proxy.

## Limits and next evidence

This is an upper-body proxy. It has not verified MPFB mesh, fingers, contact
locks, feet, support transfers, or continuous swept collision between the
sampled instants. The simulator's permissive `feasible` boolean is not used as
a clearance claim: it allows small reach and body-intrusion tolerances and
does not represent every collision class as fatal. A whole-body turn requires
authored or data-covered foot support and placement before any production
integration can be considered.

Print the measured table and run the focused contracts with:

```powershell
$env:STAFF_TURN_STUDY_REPORT = "1"
npx vitest run --config tests/config/vitest.config.ts tests/unit/collision-lab/staff-turn-preparation-study.test.ts src/lib/features/stage/locomotion/dodge/swept-volume-builder.test.ts
```
