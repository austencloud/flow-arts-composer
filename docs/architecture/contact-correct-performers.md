# Contact-correct performers

Status: architecture and implementation plan, 2026-09-20. Acceptance is pending.

## Required result

The existing `/test/grip-lab` becomes a quiet inspection surface for one real
production performer executing a right-hand, red staff isolation from South
through East, North, West and home. The thumb end remains fixed in world space.
The performer adapts to the authored prop, rather than moving the prop to hide
reach error. Both hands and several different rigs must be inspectable. The
stage, playback, scrub, reset, camera views and character selection are primary;
measurements belong in an optional diagnostics drawer.

Acceptance requires visible cylindrical grip, including thumb and pinky,
clearance around the body and clothing, and repeatable motion without popping.
Passing capsule tests does not establish mesh clearance or natural movement.
Unsupported or infeasible poses must be reported, never described as solved.

## Existing owners and historical work

Searches: grip, socket, finger, capsule, collision, stance, authoritative,
PerformerRig and swept volume. Closest runtime owners are the installed
`@austencloud/scene-3d` PerformerRig, Avatar3D, AvatarAnimator, FingerAnimator and
CollisionDetector. Product posture planning lives in
`src/lib/shared/3d/collision/upper-body-stance-planner.ts` and `stance-yaw-track.ts`.
LiveSequencePerformer3D composes these for sequence playback. The existing
`/test/grip-lab` directly uses PerformerRig but carries page-local weaving and
avoidance; that behavior must move into or be replaced by shared owners.

The September 1 East posture handoff is evidence of an experiment, not a
verified implementation. Inspect its old worktree if present, compare current
owners, and salvage only scoped logic. Do not import its generated package
patch. Keep all unrelated edits intact.

Extend the current Three.js/Threlte owners. No engine migration, parallel rig,
physics-driven grip, dataset import, or replacement model generation is needed.
Epic's [IK solver stack](https://dev.epicgames.com/documentation/unreal-engine/ik-rig-solvers-in-unreal-engine)
and [Full Body IK](https://dev.epicgames.com/documentation/unreal-engine/node-reference/ControlRig/FullBodyIK)
support ordered body/limb solves with limits and preferred angles. They are
references for constraints, not evidence that this application already solves
whole-body contact. Existing elbow hints and limb IK remain their owners.

## Contact contract

Use metres and world-space target transforms at the solver boundary. A staff
has actual rendered length, cylindrical grip radius, a grip station, a signed
thumb-to-pinky axis and an authored transform. A rigid isolation derives the
grip position from a fixed endpoint minus the rotated endpoint offset. No late
translation or rotation may alter that transform in authoritative mode.

Each rig supplies its bind-pose hand frame, wrist-to-palm/socket transform,
finger chains and lengths, and conservative finger segment radii. Measure
these from the loaded rig; do not use a character-name exception or assume bone
local axes agree across exports. Each finger is a chain of capsules, including
the distal tip. Refine bounded joint angles against cylinder contact; reject
penetration and preserve bind-pose retargeting and handedness. The thumb must
oppose the fingers, not merely get close to the index knuckle.

Contact reports contain per-finger signed clearance and coverage status, palm
position and axis residuals, reach residuals, actual body intersections, and
the target/rendered endpoint difference. Missing geometry is unavailable,
never zero. Clothing clearance uses a padded pelvis/torso envelope until mesh
testing supplies stronger evidence; label this approximation explicitly.

## Ordered solve

1. Sample authored choreography at deterministic score time; calculate the
   fixed-endpoint staff transform and upcoming targets.
2. Plan gross stance and torso participation against reach and body clearance.
   Keep foot support explicit; do not rotate a root over stationary feet and
   claim a step. A modest planted lean is preferable to an unverified gait.
3. Route clavicles/shoulders and elbow poles with joint limits and measured
   body geometry; run the existing arm IK.
4. Align wrist and measured palm socket to the authored cylinder.
5. Refine finger contact within anatomical bounds.
6. Measure post-solve collisions and correct body/poles/contact in bounded
   iterations. The prop target is immutable. Re-solve affected downstream
   stages after a correction; report infeasibility when the budget is spent.
7. Preserve continuity through a deterministic phase-indexed solution or
   bounded warm starts with reset on seek/rig change. Never smooth the prop
   away from the authored endpoint. Validate intermediate frames as well as
   rendered samples and the loop seam.

Collision coverage includes staff/fingers, staff/arms, head, neck, torso,
pelvis/clothing, and limb/limb. Reuse CollisionDetector geometry and explicitly
extend missing categories. Exclude only anatomically connected segment roots
and the intended palm grip, not entire hands or the held arm.

## Measurable gates

These are acceptance thresholds, not claimed measurements:

| Measure | Gate | Reason |
| --- | --- | --- |
| Fixed endpoint drift | <= 0.5 mm | Rigid authored geometry should be numerically exact |
| Palm contact residual | <= 2 mm | A larger gap is apparent in close-up |
| Staff/palm axis residual | <= 2 degrees | Prevent a visibly skewed channel |
| Finger/shaft penetration | <= 0.5 mm | Numerical tolerance, not permission for visible overlap |
| Intended finger surface contact | <= 2 mm for supported fingers | Detect open fingers as well as penetration |
| Body/prop penetration | <= 1 mm proxy tolerance, no visible mesh overlap | Proxy and visual gates are both required |
| Arm reach excess | <= 1 mm without bone stretching | Do not disguise impossible reach |
| Held-pose jitter | <= 0.1 mm and 0.1 degree after initialization | Frozen poses must stay frozen |
| Continuity | no discontinuous branch changes or seam snap | Record maximum per-sample displacement/angle and acceleration |

Sweep at fixed 1/240-cycle intervals plus midpoints; repeat at different frame
partitions and random seek order. Use at least ch07, a substantially different
catalog rig, and an available imported rig. Cover both hands, cardinal, depth,
overhead, cross-body and low targets. Record unsupported rigs and failed gates.
Do not hide a failing sample or reduce the sweep to a convenient quarter arc.

## Implementation and review sequence

1. Preserve this plan; adversarially review ownership, geometry, determinism,
   tolerances and UI contracts. Amend before implementation.
2. Make a private editable copy of the installed package in the task worktree;
   retain the existing patch and regenerate only explicitly owned source and
   matching runtime/type entries. Never rebuild unrelated distribution files.
3. Extend shared contact, body response and diagnostics owners with regression
   tests. Expose an explicit opt-in prop-authoritative mode to existing hosts.
4. Replace grip-lab presentation with shared transport, segmented controls,
   character picker, framing and drawer primitives. Page code composes the
   shared solver; it cannot own pose or avoidance algorithms.
5. Test real rig geometry, intermediate-frame counterexamples, retargeting,
   solver ordering, no drift, determinism and collision response. Run relevant
   existing suites and narrow type checks.
6. Inspect frozen front/side/hand views across the complete loop on each rig,
   then inspect live motion and responsive layout at the seven required tiers
   plus 200% reflow and reduced motion. Preserve actual evidence.
7. Adversarial implementation review, material fixes, affected rechecks,
   scoped commit and guarded local integration. Leave the integrated page open.

No task may mark these gates complete on unit-test evidence alone. Append
implementation decisions, measured results and unresolved limits here or in a
linked evidence document. No external deployment is authorized.

## Plan review resolution

The [adversarial review](contact-correct-performers-plan-review.md) is retained.
All findings are accepted as implementation requirements:

- Authority is a named `prop-authoritative` contact mode in PerformerRig and
  Avatar3D. It resets both correction translation and quaternion every solve,
  bypasses all achieved-hand prop welding and validates directed endpoints.
  The legacy mode remains available to unaffected consumers.
- Finger contact replaces preset-only output in this mode. The measured hand
  frame and cylinder determine targets; all five chains, including distal
  tips, are evaluated. Contact reports include missing geometry and solver
  convergence, never fabricated zero readings.
- Proxy clearance and posed-mesh clearance are separate gates. A shared audit
  can use Three.js SkinnedMesh.getVertexPosition followed by matrixWorld to
  evaluate posed skin vertices/triangles against the finite staff cylinder.
  Exclude intended palm contact only through skinning/bone ownership near the
  grip; do not exclude clothing, fingers, the free hand, or whole arms. Sample
  triangles as well as vertices so a shaft through a large face is detected.
  Missing mesh audit makes the mesh gate unavailable and blocks certification.
- Acceptance covers independent left and right one-hand cases. A two-hand
  grasp of the same shaft is outside this proof. The free hand participates
  in body collision checks but has no staff-contact requirement.
- Directed thumb/pinky axis checks cannot use absolute dot products. Every
  gate has a scalar plus availability/convergence status in the report.
- Prefer a history-free phase solve with canonical bind reset and bounded
  iterations. If iterative convergence requires settling, use fixed 1/120 s,
  at most 32 iterations, residual change <= 0.1 mm / 0.1 degree for two
  consecutive iterations; an exhausted sample fails. Compare cold/random-seek
  and chronological samples at the same phases. Idle motion must be disabled
  or sampled from the same score clock in this mode.
- Numeric coverage runs separately from visible playback, reusing loaded rigs.
  Cap each configuration at 60 seconds and retain cancelled/exhausted status.
  Retain phase, side, rig, dimensions, all metrics and unavailable fields,
  iterations, maximum discontinuities and worst-frame references in JSON.
  Visual inspection remains a separate required gate.

The old East worktree and branch are absent at investigation time. The current
main already contains later shared posture and convergence work; there is no
uncommitted historical patch to import.
