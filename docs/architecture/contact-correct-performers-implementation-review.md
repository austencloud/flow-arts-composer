# Contact-correct performers: implementation review

Status: final review rejects merge for discontinuous arm motion and unverified
posed-skin clearance. The final disposition at the end supersedes the initial
findings retained below. Reviewed 2026-09-20 against the task's scene-package
source, installed patch, tests and browser evidence.

## Initial review findings

### P0 — Endpoint drift telemetry is fabricated from the authored segment

`Avatar3D.svelte` assigns both `authored*Endpoint*` and `rendered*Endpoint*`
from `blueSegOrNull` / `redSegOrNull`. Those segments are calculated from the
authored world prop and are not read from the final rendered prop
anchor/correction hierarchy. The equal assignments guarantee a zero endpoint
drift report even if the rendered transform is wrong.

**Required correction:** capture authored endpoints before solve from the
authoritative prop state, then calculate rendered endpoints after
`applyContactLock` from the final rendered parent world transform and actual
rendered profile. Assert those are distinct data paths in a regression test.

### P0 — Finger clearance math overwrites its own input joint positions

`FingerAnimator.measureFinger` passes `scratchA/B/C` as segment endpoints to
`segmentSegmentDistance`. That method uses `scratchA` and `scratchB` for its
direction outputs, overwriting `a0` and `a1`, then derives `w` and final
closest points from the altered inputs. The first clearance corrupts the
following segment measurements as well. The reported min clearance, coverage,
and support are therefore not geometrically meaningful.

**Required correction:** use dedicated segment-solver scratch vectors or local
immutable copies for `u`, `v`, `w`, and closest points. Add known segment/
finite-cylinder cases for separated, tangent, penetrating, cap-end, and all
three finger segments; ensure calls do not mutate supplied positions.

### P0 — Missing fingers can pass convergence

Convergence evaluates `hand.fingers.every(finger => !finger.available ||
finger.supported)`. An unavailable thumb, pinky, or complete chain is thus
accepted. This directly violates the contact contract that missing geometry is
unavailable rather than solved.

**Required correction:** require exactly the five expected reports and require
each to be available, axial-covered, and supported for a hand to converge.
Report incomplete hand geometry as infeasible/unavailable and add a test for a
missing pinky chain.

## Material unproven or incomplete claims

### P1 — Strict fingers reset, but the full pose is not a cold deterministic solve

`solveCylinderContacts` restores authored finger curls in strict mode, which
removes one history source. The arm/wrist solve still runs after live
`fingerAnimator.update(delta)`, retains wrist world-quaternion smoothing and
head-dodge state, and exposes no canonical bind reset/fixed-step convergence
entry point. Existing tests cover finger repeatability and body-frame history,
not cold seek versus chronological playback across the real pose.

**Required correction:** expose/reset all contact-relevant animator state and
run the specified fixed 1/120-second bounded solve before a sample. The full
sweep must compare cold/random order against chronological values, including
body points and rotations, and fail unsettled samples.

### P1 — The reported palm residual is not a measured cylinder-contact residual

`contactForSide` compares palm world point with `_blueIKTarget`/`_redIKTarget`.
Those are the arm target values, not a measured closest palm surface point to
the finite staff cylinder. It can indicate an IK socket error but cannot prove
the stated palm contact threshold. `reachResidualM` is likewise a simple
shoulder-to-target chord less chain lengths; it does not account for joint
limits, clavicle routing, or the actual achieved wrist.

**Required correction:** label both values as socket/chord residuals until
actual palm geometry and bounded arm reach metrics exist. Do not use them for
the palm or reach acceptance gates.

### P1 — Finite-cylinder checks are shaft-only, not the actual rendered staff profile

Strict contact builds one cylinder from `staffContact.lengthM` and `radiusM`.
The Fire staff profile includes a grip radius, outer shaft radius, and knots;
the single cylinder cannot represent knot/body clearance. The contact report
does not identify which rendered profile supplied the dimensions.

**Required correction:** pass a named set of finite collision segments from the
rendered prop profile and report its version. Test grip, shaft, and knot
intersections separately; never certify profile clearance using a narrow grip
cylinder for the entire staff.

### P1 — Body collision and mesh clearance remain external to the core report

`bodyCollisionEvents` are the existing proxy detector events. The core callback
offers geometry root plus report, but it does not contain posed mesh audit
status, volume containment, triangle budget, or a mesh result. Therefore the
core implementation alone cannot establish the required clothing/body mesh
gate; integration must compose the shared audit and fail certification when it
is unavailable/exhausted/ambiguous.

The shared audit now treats a staff contained by a watertight rendered mesh as
a failing `mesh-contained` result even when it has no surface crossing. It
keeps intentional palm triangles in the volume shell, scans raw triangles for
budget accounting, and evaluates each closed mesh independently so overlapping
meshes cannot cancel ray-parity hits. This is evidence for the audit behavior,
not evidence that a production rig has passed it.

## What is actually evidenced

- A named `prop-authoritative` mode exists and `applyContactLock` resets the
  correction translation and quaternion in that mode, so legacy last-mile
  correction is bypassed at that method.
- Strict finger solve restores its authored grip before six bounded refinement
  iterations; this is evidence of finger-local repeatability only.
- A five-name report type exists and references proximal/middle,
  middle/distal, and distal-tip segments, but the current aliasing defect means
  it is not evidence of correct segment distances.
- No available test establishes real-avatar full sweeps, true rendered endpoint
  equality, clothing/mesh clearance, or cold-versus-chronological equivalence.

## Original plan-review dispositions

The architecture resolution accepts each earlier finding as a requirement.
Implementation evidence changes none to complete: authority is **partial and
blocked** by fabricated endpoint telemetry; cylindrical contact is **blocked**
by corrupted segment math and fail-open availability; mesh/clothing is
**pending integration**; deterministic sweep is **pending**; independent
one-hand scope is **resolved in the plan** but awaits proof. Metric direction
and performance/evidence retention remain **pending integration**.

## Final frozen-source verification

The three original P0 defects above are fixed in the frozen source: rendered
endpoints are now read from the final correction/anchor hierarchy rather than
copied from the authored segment; the finite-segment calculation has dedicated
scratch vectors; and convergence requires five available, supported fingers.
The real hand-fit fixture now passes all thirty rig/side/finger cases. Its
worst signed clearance is +0.152 mm (personal-metaperson right pinky); ch07
ranges from +0.196 to +0.352 mm. Browser evidence after the strict-readiness
guard also shows ch07 right East thumb +0.220 mm and all five fingers
supported. This fixes the earlier browser-versus-fixture lifecycle mismatch.

Two release blockers remain.

### P0 — All eight real-rig dense sweeps have discontinuous arm branches

`contact-correct-avatar-sweep.test.ts` samples 961 phases for ch07, ch12,
ch18, and personal-metaperson on both sides. All eight cases retain the
endpoint, axis, reach, limb-length, feet, and finger gates, but fail the
continuity gates. Measured maximum single-sample displacements range from
169.6 to 250.6 mm (gate 25 mm); rotations range from 43.3 to 53.0 degrees
(gate 10 degrees). The worst recorded bone is `RightArm` in the saved ch07
and ch12 evidence. This is an actual branch/pop defect, not an unavailable
metric, so the dense sweep cannot certify a smooth performer.

**Required correction:** make strict arm pole/roll selection phase-continuous
while preserving cold-seek equivalence, then rerun all eight dense sweeps
without relaxing these gates.

### P0 — Rendered posed-skin clearance fails at every tested cardinal/intermediate frame

`contact-correct-posed-skin.test.ts` runs the actual ch07/right skinned root
against all seven finite pieces of the Fire staff profile at 17 phases. All
five capsule finger reports are supported, but every mesh sample reports a
surface intersection in `Ch07_Body`: 6.811–8.707 mm, worst at phase 3.0.
The mesh is non-watertight, so its closed-volume result is correctly
`unavailable`; this alone blocks volumetric certification as well.

The grip-lab invokes `auditFireStaffProfile` without a `heldPalm` descriptor.
It therefore does not implement the planned narrow, skin-owned palm exclusion,
and the single skinned-mesh region name cannot distinguish torso/clothing from
an intended held-contact triangle. The result is still a valid no-pass
intersection report, but it is not yet a diagnosis of the body-clearance
solver.

**Required correction:** provide the measured held-palm descriptor only for
the connected palm/grip window and retain all fingers, arms, clothing, and
body triangles. Emit sub-region/bone attribution for the worst triangle. Then
resolve any remaining non-palm penetration and either use a watertight body
shell or retain an unavailable volumetric gate. Do not certify clearance from
the current result.

The remaining `palmResidualM` is a palm socket-to-grip-center distance and
`reachResidualM` is a wrist/chord diagnostic; neither is an independently
measured palm-surface cylinder residual. They may remain operational
diagnostics, but must not be presented as geometric palm-surface proof.
