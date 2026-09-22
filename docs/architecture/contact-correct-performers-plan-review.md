# Contact-correct performers: adversarial plan review

Status: findings only; disposition is pending plan revision. Reviewed against
the current installed `@austencloud/scene-3d` source/runtime and the existing
grip sweep, contact, and collision tests on 2026-09-20.

## Blockers

### P0 — Prop-authoritative mode has no explicit renderer boundary

**Evidence.** `Avatar3D.svelte` always calls `applyContactLock` after the
animation solve. In legacy mode it translates the correction group up to its
residual cap; with `weldGrip` it also derives the rendered prop orientation
from the achieved knuckle line. `AvatarAnimator.setPropsAndBlend` also derives
the hand goal by subtracting a palm/socket approximation from the prop target.
The current `PerformerRig` API exposes `weldGrip`, not an authored-transform
lockout. This is the inverse of the requested authority direction.

**Required correction.** Define one named prop-authoritative render path at
`Avatar3D`/`PerformerRig` level: authored world position and quaternion are
copied to the final prop anchor/correction group and no post-IK code may change
either. Make the existing contact lock and achieved-knuckle weld mutually
exclusive with that mode. Add a runtime assertion/test that reads the final
rendered endpoints after every solve and compares them to the authored segment;
test source *and* package runtime entries. Do not describe this as an opt-in
flag until the authoritative boundary owns both translation and rotation.

**Disposition:** pending.

### P0 — The proposed cylindrical contract cannot be met by the existing grip solver

**Evidence.** `CylinderGraspSolver` independently converts segment length and
one cylinder radius to local Euler curls. It supplies fallback lengths, assumes
local X flexion, rounds to whole degrees, and has no staff world transform,
contact point, segment radii, signed clearance, or per-finger optimization.
`AvatarAnimator` only fits a channel from the posed *middle* finger; its grip
axis is root-to-root index/pinky. The existing thumb regression checks thumb
tip distance to Index2, not thumb-to-cylinder contact. Thus pinky inclusion in
the current animation is not cylindrical pinky contact.

**Required correction.** Make the new solver explicitly replace/bypass that
Euler-only result in prop-authoritative mode. Its input/output contract must
contain the staff axis, radius, station, hand frame, all 15 measured bones and
segment radii; output per-finger capsule signed clearance/coverage plus joint
limits and an infeasible reason. Add real-rig tests for every finger on both
hands, including distal tip capsules, and reject a result that merely places
the thumb near an index knuckle. Keep the middle-finger channel only as a
legacy fallback, never as proof of five-finger contact.

**Disposition:** pending.

### P0 — Clothing/mesh acceptance is unsupported by the stated collision owner

**Evidence.** `BodyCollisionGeometry.ts` and `CollisionDetector.ts` use fixed
spheres/capsules around face, neck, spine and arms. `BodySnapshot` contains no
clothing, skin mesh, finger capsules, mesh acceleration structure, or
connected-segment identity. Current collision tests exercise those proxy zones
only. A padded torso/pelvis proxy can be a useful conservative screen but it
cannot establish the plan's “no visible mesh overlap” gate or report actual
clothing intersections.

**Required correction.** Split gates into (a) mandatory proxy clearance with
the exact proxy definition/version recorded and (b) a separately implemented
mesh/clothing audit. Before promising the latter, identify the skinned-mesh
world-space representation and a deterministic posed-mesh query; if that does
not exist for a rig, report `mesh-clearance: unavailable`, not pass. Add an
explicit collision-pair policy for held staff/palm and anatomically adjacent
finger roots, because the current detector has no way to express those narrow
exclusions.

**Disposition:** pending.

### P1 — “Deterministic full sweep” needs a reset and settle specification

**Evidence.** The live animator retains wrist world-quaternion smoothing and
head-dodge smoothed state. Existing sweep tests deliberately accept a sample
only after two reads agree following `seek`; they are not a proof that a random
seek produces the same pose as chronological playback. The plan currently
allows warm starts while requiring random seek order, which leaves the result
dependent on prior samples and frame delta.

**Required correction.** Define two distinct measurements: (1) a cold solve
per score time, constructed/reset from the same rig bind state and advanced by
a fixed solver timestep to a defined convergence bound; (2) chronological
playback at the same fixed timestep. Require authored endpoints and reported
contact/collision maxima to agree within stated tolerances between those runs.
Record fixed timestep, exact settle count/convergence criterion, seed/order,
and whether smoothing is disabled or deterministically replayed. A failed or
unsettled sample blocks the configuration; it must not be silently retried into
a pass.

**Disposition:** pending.

### P1 — Multi-hand scope is ambiguous and can create an impossible constraint

**Evidence.** The requested scene is a right-hand red-staff isolation, while
the plan also requires “both hands” and the installed architecture models blue
and red as separate prop states. Two hands gripping one rigid staff require a
second station and a coupled solve; independently targeting each hand is
over-constrained whenever authored pose, arm reach, or hand frame disagree.

**Required correction.** State whether acceptance is (i) independent
single-hand red and blue cases, or (ii) a two-hand grip on one staff. For (ii),
make the authored staff transform and two fixed grip stations the sole targets,
solve both arms jointly/iteratively, and define which hand may be unavailable.
For (i), say that the non-holding hand is collision-tested but has no contact
gate. Do not infer a two-hand result from two separate red/blue tests.

**Disposition:** pending.

## High-risk corrections

### P1 — Current metrics can accept the wrong direction and omit the requested measurements

**Evidence.** Existing `gripAxisErrorDeg` treats parallel and anti-parallel
axes as equally correct. Existing sweep samples score axis error, generic
contact offset, separation, and proxy collision events; they do not carry
directed thumb-to-pinky orientation, endpoint drift, per-finger clearance,
finger penetration, wrist/palm residual, reach excess, or mesh availability.

**Required correction.** Add directed endpoint/axis checks (thumb and pinky
ends are not interchangeable), then make every acceptance-table field either a
recorded scalar/status or explicitly unavailable. The runner must fail closed
when a required field is unavailable. Preserve the existing scoring suite as
legacy coverage; it does not validate the new gates.

**Disposition:** pending.

### P2 — Full sweep cost and evidence retention are unspecified

**Evidence.** A 1/240-cycle sweep plus midpoints across rigs, views, retries,
and bounded post-collision iterations is substantially more work than the
current coarse/fine, browser-settled sweep runner. Per-frame skinned mesh tests
would multiply that further. No time/memory budget, cancellation behavior, or
artifact schema is stated.

**Required correction.** Run the numeric sweep off the visible inspection
surface with reusable rig/geometry allocations and a bounded per-sample solve
budget. Specify wall-clock and memory budgets, cancellation, and a durable
result schema containing every sampled phase, maxes, unavailable fields,
solver iteration count, and the worst-frame camera evidence. Keep rendering
inspection separate from exhaustive numeric sampling so the UI remains
responsive.

**Disposition:** pending.

## Implementation sequencing amendment

Before implementation, amend the plan to resolve P0 items and choose the
multi-hand scope. First ship the renderer authority boundary and endpoint
oracle; then the measured per-finger solver/report; then proxy/mesh collision
capabilities and deterministic runner. Grip-lab may consume only that shared
result. Its existing private weave, avoidance, and body-shift code cannot serve
as proof because it changes targets around the performer.
