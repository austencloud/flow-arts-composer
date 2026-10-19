# Avatar sequence collision audit and posture correction

Date: 2026-08-30

## Problem

The production 3D sequence viewer can place a forearm through the performer's
neck or torso without reporting a collision. It also leaves the shoulders
square to the audience when both hand targets gather on one side of the body.
That makes a valid same-side target, such as two props at E, become a crossed
reach through the head instead of a natural bladed stance toward the props.

The current systems already contain most of the required behavior:

- `CollisionDetector` samples the final post-IK skeleton every rendered frame.
- Collision Lab owns the matching pure kinematic approximation and stance
  optimizer.
- `AvatarAnimator` owns smoothed stance yaw and reflexive head clearance.
- `PerformerRig` owns the exact prop-anchor geometry used as IK targets.

This work extends those owners. It does not add a second collision detector,
IK solver, or locomotion turn controller.

## Scope

### 1. Detect the missing body intersections

Add two collision categories to both live detection and Collision Lab parity:

- `arm-through-neck`: a forearm or distal upper arm enters the padded neck
  volume;
- `arm-through-torso`: a forearm or distal upper arm enters the padded torso
  volume.

The shoulder-adjacent part of each upper arm is excluded because it is
anatomically attached to the torso. Collision descriptions identify side and
segment so a report names the actual failure.

### 2. Aggregate sequence-time failures

Forward the live collision callback through `PerformerRig`. A dev-only audit
collector in the production viewer records every sampled frame, closes a
cluster when a zone clears, and reports:

- performer, zone, severity, first and last sequence position;
- frame count and worst penetration;
- the exact worst step and beat progress for deterministic scrubbing;
- all descriptions observed in the cluster.

The collector is exposed as `window.__avatarCollisionAudit` in development so
browser verification can clear a run, play one loop, read a JSON report, scrub
to the worst samples, and capture screenshots. Empty callback frames matter:
they are how clusters are closed instead of growing across unrelated beats.

Repeated loops fold into one cluster per span start (performer, zone, step and
tenth of a beat), keeping the deepest, so the audit stays the size of one loop
however long playback runs. The snapshot mirrored to `sessionStorage` and the
root element carries only the 40 deepest clusters plus `totalClusters`; the
full list comes from `window.__avatarCollisionAudit.report()`. Before this
(2026-10-18) the mirror reached 11 MB after ten minutes of playback and froze
the viewer for 230 ms every fifth frame.

### 3. Plan a same-side upper-body stance

Add one pure posture planner beside the shared 3D performer code. It receives
the exact rig-local blue/red grip targets after hand-anchor offsets. When both
targets coherently occupy the same lateral side, it returns a bounded stance
yaw toward their weighted center. Opposed or centered targets return zero.

This is an upper-body stance adjustment distributed through the existing
spine-yaw track. It is not a locomotion turn: feet and stage facing remain
authored, avoiding an unsupported root rotation under planted feet. The
animator's existing smoothing prevents per-frame snapping.

The production viewer enables both this stance track and the existing
head-dodge reflex. Other `PerformerRig` consumers remain unchanged until their
own visual acceptance pass.

## Risks and controls

- **False torso hits at the shoulder.** Exclude the proximal upper-arm segment
  and test it separately from the forearm.
- **Yaw oscillation when hands split sides.** Weight yaw by lateral coherence
  and a smooth dead zone; leave temporal smoothing to `AvatarAnimator`.
- **Confusing stance with a foot turn.** Do not change root yaw, gait, foot
  contacts, or authored stage facing in this scope.
- **Telemetry cost.** Install the sequence collector only in development and
  cap retained clusters and open-frame histories.
- **Lab/live drift.** Add the same collision vocabulary and geometry to the
  live detector and `StanceSimulator`, with parity tests.

## Verification

1. Focused unit tests prove neck/torso detection, shoulder-root exclusion,
   cluster boundaries, worst-frame selection, and yaw behavior for centered,
   split, left-side, and right-side targets.
2. Existing collision-lab and elbow/IK tests remain green.
3. Run the Austen MetaPerson through short code `ZTI6`, collect at least one
   complete loop, and save the report plus screenshots of the worst clusters.
4. Compare the same worst sequence positions before and after the posture
   correction. Acceptance requires no visible forearm-through-neck/torso frame,
   correct shoulder-facing direction for the same-side E case, and no new
   opposite-side regression.
5. Run one repository check after focused tests and visual iteration.

## 2026-08-31 rendered-pose correction

Live `ZTI6` telemetry exposed a transform-order gap in the first implementation.
Grip weld rotates and translates the visible staff after arm IK, but head dodge
and collision detection still measured the authored prop anchor. A shaft could
therefore pass through the rendered head while the report contained no
`prop-through-head` event.

The shared `Avatar3D` owner now derives both staff threats and collision segments
from the final correction-group world pose. The audit also records requested
pitch, smoothed stance yaw, reach lean, head dodge, and achieved torso pitch so a
bad frame can be attributed instead of judged by eye alone. Startup frames with
an unbound zero-width skeleton are excluded.

The same-side stance planner no longer adds an unconditional 18-degree forward
pitch. Shoulder yaw remains the assistance for two targets on one side; the
animator's existing cross-body pitch and reach-deficit lean remain available
only when their own geometry engages them.
