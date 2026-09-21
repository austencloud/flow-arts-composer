# Contact-correct performer evidence

Status: blocked by failed physical acceptance checks; preserved on
`codex/contact-correct-performers`, unmerged. This is an implementation
checkpoint, not a completed contact-correct performer.

## Pose teaching in the existing grip lab (2026-09-21)

The grip lab now separates S→E, E→N, N→W and W→S, with quarter looping,
scrubbing, chest/pelvis/elbow-route/tip handles, numeric controls, Undo, saved
pose markers and URL replay. Every edit authors a key at the paused phase;
cyclic smoothstep interpolation is shared with the older isolation page.
The elbow handle is a pole direction, not an unconstrained joint position.

The source review covered the negative-space reach reference, archived
behind-body prototype, staff-turn-preparation study, the old isolation
keyframes, and the archived **Anatomy Lab** task
(`01a06a2b-66ee-7693-8b22-6c5053ec16ef`). That task's request for flowing turns
does not establish anticipation for every move. Austen's latest clarification
governs this exercise: shoulders remain neutral through North, then turn stage
left during N→W, countershifting stage right and downstage. See section 9 of
[the reach reference](../reference/negative-space-and-wall-plane-reach.md).

An optional authored-pose input on the shared performer replaces the automatic
target-following lean/crouch for this lab. Callers that omit it retain the prior
solver behavior. Feet remain planted within the rig's leg reach; torso rotation
is distributed across the spine. The baseline is an editable first proposal,
not Austen-approved choreography or proof of the intended elbow occlusion.

The teaching circle has a constant 25 cm upstage placement adjustment. Separate
animated tip offsets are bounded in total 3D distance by the visible drift
control (default ceiling 13 cm; zero requests exact isolation). The measured
first baseline uses 9 cm upward displacement at South and approximately 9.4 cm
of lateral/depth displacement at West. These are substantial allowances, shown
explicitly for teaching rather than described as perfect isolation. A bounded
real-rig probe at 13 phases found a remaining 10.75 mm palm residual at 3.9;
the other sampled positions were at or below 0.009 mm. This is not a dense
contact, penetration, or natural-motion certification. Gaps over 3 mm are
visible warnings in the page.

Browser checks verified a real pelvis-handle drag, Undo, insertion of a pose at
2.5, copied-link reload restoring its 40° turn and all six poses, and zero drift
reporting zero actual displacement. The TransformControls wrapper required its
explicit `onchange` forwarding path for continuous drag writes. The page uses
stage/house labels; front-camera world +X is stage left, +Z is downstage.

Layout was inspected at 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
2560×1440 and 3840×2160, plus a 640×360 CSS-viewport reflow equivalent to
200% zoom on the native 1280×720 panel. No horizontal overflow was measured.
The editor scrolls independently when needed; fixed scene heights prevent the
canvas's intrinsic height from expanding the narrow/short layout. Saved pose
buttons retain 44 px height instead of shrinking away. Browser capture scaling
under emulation added black margins/stitching artifacts at large sizes, so
those images were interpreted alongside CSS geometry rather than as pixel-size
evidence.

Playback investigation found that equivalent hand-local staff endpoints varied
by only 21 nanometres between poses, but string rounding to seven decimal
places produced different fit-cache keys. That repeatedly ran the expensive
thumb/finger seed search. The cache now compares equivalent cylinder geometry
with a 0.1 mm endpoint bound and tight scale tolerance; grip type and
radius must match. It still remeasures the contacts against the current posed
mesh. A real hand-relative shaft shift remains a cache miss; this is not a
general reuse of earlier finger poses over changing contact geometry. A first
one-micrometre bound still missed intermediate frames with small arm-solve
residuals, so the final endpoint bound is below both the existing 0.5 mm
penetration limit and 2 mm contact tolerance.
The real-rig regression confirms 20 nm perturbation retains the fitted finger
rotations, a 0.05 mm shift retains contact and independently audited surface
penetration within the existing limits, and a 1 mm axial staff shift invalidates
the fit. The final focused
run passes 13 tests across five files; `npm run check` reports zero errors and
warnings. The installed package's 21 owned source/runtime/type artifacts match
the preserved patch. Existing multiple-Three import warnings remain.
Successive final browser reads during N→W advanced phase 2.511→2.556 over
approximately 0.13 seconds, with responsive pause/scrub/edit actions.
See [the verified editing view](contact-correct-evidence/isolation-teaching-controls.webp).

Focused tests cover cyclic interpolation and URL round trips, malformed links,
the phase-wrap seam, rigid staff geometry and bounded drift, real-rig authored
body/feet invariants, and the existing stationary skin-fit grip. None of these
certifies the previous full-motion solver failures below. This teaching tool
remains on the unmerged experimental branch with that limitation.

## Stationary grasp correction after user review

The user's ch07/right screenshot at phase `0.806` correctly rejected the
previous grasp. The old capsule report marked all fingers supported while the
visible index skin intersected the grip by 6.81 mm. That report was insufficient.

The updated fitter uses posed finger triangles for collision and contact,
requires distal contact and a cross-sectional enclosure of the shaft, and
searches bounded thumb-base orientations against the actual staff. It caches
the result in hand-local space. The grip center is calibrated 8 mm palmar and
8 mm longitudinal from the inferred channel for this stationary case. The
physical grip radius includes the model's raised wrap: 10.2125 mm.

Skin queries now refresh `SkinnedMesh` bind inverses through `updateMatrixWorld`,
matching the renderer. `updateWorldMatrix` alone produced a false difference
between headless tests and the displayed hand. A translated/scaled skinned-mesh
regression covers this distinction.

The installed preview at the exact user frame measures **0.06 mm maximum
surface overlap** against the conservative fire-staff profile. All five contacts
are supported; the thumb pad clearance is 0.546 mm. Close-ups were inspected
from the front, side and beneath the palm:

- [Before](contact-correct-evidence/ch07-right-0806-before-skin-fit.png)
- [Front](contact-correct-evidence/ch07-right-0806-surface-fit-front.png),
  [side](contact-correct-evidence/ch07-right-0806-surface-fit-side.png),
  [palm](contact-correct-evidence/ch07-right-0806-surface-fit-palm.png)
- [Rendered diagnostics](contact-correct-evidence/ch07-right-0806-surface-fit.json)

Nineteen focused tests pass, including the real-rig stationary grasp, independent
skin audit, finger enclosure, held-frame replay, and fixed staff trajectory.
`npm run check` reports zero errors and warnings. The persistent package patch
was installed offline with a frozen lockfile; all 21 owned source, runtime and
declaration artifacts matched the authored package.

This is verification of the reported stationary grasp, not certification of
every avatar, hand, prop diameter or full motion. The 8 mm socket calibration
has not been generalized. Cold fitting also takes seconds and needs performance
work before broad rollout. The earlier full-motion continuity failures below
have not been revalidated after this correction; volumetric containment remains
unavailable for this open character mesh. The branch therefore remains unmerged.

## Baseline

Inspected `/test/grip-lab` on local main on 2026-09-20. It displayed X-Bot,
an oversized notation staff/grid, and weave/dwell/assist controls. The staff
rotated at a stationary hand point; this was not a fixed-endpoint isolation.
The page owned private body-capsule and prop-avoidance logic. Its output is not
the acceptance reference for the new proof.

The historical `E:/tka-platform-east-posture-planner` worktree and branch are
absent. No historical uncommitted package patch was imported.

## Architecture review

See [plan](contact-correct-performers.md) and
[adversarial findings](contact-correct-performers-plan-review.md). Required
corrections were incorporated before implementation: explicit prop authority,
all-finger cylinder constraints, separate mesh auditing, deterministic reset,
independent one-hand scope, directed metrics and bounded numeric sweeps.

## Checks completed

- Authored trajectory: three focused tests pass. 961 phase samples preserve
  the chosen thumb endpoint to floating-point tolerance, cardinal traversal is
  South/East/North/West, and arbitrary seek order preserves the result.
- These tests prove authored rigid geometry only. They do not prove achieved
  hand contact, body response, skin/clothing clearance, or natural motion.
- Focused regression run: 13 tests across trajectory authority, finite finger
  cylinders, real-rig finger fit, thumb contact and bind-pose retargeting pass.
  The finger-fit matrix includes ch07, ch18 and the locally available imported
  MetaPerson, both hands. These are bone/capsule checks, not posed-skin approval.
- `npm run check`: zero errors and zero warnings in the task worktree.

## Browser inspection

Inspected the private task server at `/test/grip-lab`, including front and hand
views, cardinal seeks, active-hand changes and the diagnostics drawer. An
intermediate package build exposed a false-positive gap between the isolated
finger fixture and runtime: the thumb remained 13.74 mm from the shaft, and
the skin audit reported up to 10.45 mm penetration. The rendered East close-up
visibly crosses the hand. This is a failing observation, retained in
[the intermediate screenshot](contact-correct-evidence/ch07-right-east-interim.png).
The package was subsequently being revised; this image is not final evidence.

Responsive layout was directly checked at 375×667, 960×412, 820×1180,
1440×900, 1920×1080, 2560×1440 and 3840×2160. All controls remained accessible
with no horizontal page or control-panel overflow after correcting landscape
transport layout. Buttons measured at least 44 CSS pixels high. The browser's
emulated screenshots include scaled content and black capture padding; DOM
measurements were used alongside visual inspection rather than treating that
padding as app geometry. A 720×450 CSS viewport also reflowed without overflow
(the viewport equivalent of 200% at 1440×900; actual browser zoom is untested).
Reduced-motion emulation with `play=1` loaded paused at South and removed the
autoplay URL parameter.

Frame audit output clears when phase, hand or character changes. Choosing a
different character clears the prior geometry/report and restarts loading
feedback, so an old character's measurement cannot appear as the new one's.

## Final acceptance result

The loading mismatch was traced to a real initialization race: the render task
could run after skeleton load but during asynchronous shader preparation,
before the fingers were initialized. Strict contact captured an open-hand
socket. The runtime now waits for finger initialization of the current root;
root identity also covers character swaps. Browser cold-load verification
shows all five ch07 fingers supported, with the thumb at 0.220 mm clearance
instead of 13.744 mm. Swapping to MetaPerson also produced all five supported
fingers, 0.152–0.341 mm. The corrected pose and reports are retained in
[the final close-up](contact-correct-evidence/ch07-right-east-after-load-guard.png),
[ch07 runtime report](contact-correct-evidence/ch07-right-east-after-load-guard.json)
and [imported-rig swap report](contact-correct-evidence/metaperson-right-east-swap-report.json).

The work still fails release acceptance:

- **Continuity:** 961 samples × four rigs × two hands = 7,688 integrated poses.
  Contact, directed axis, reach, wrist limits, limb lengths, planted feet,
  finger support and cold-seek comparisons pass, but all eight configurations
  have elbow branch jumps: 169.6–250.6 mm and 43.3–53.0 degrees in one sample.
  The tests explicitly fail these values. See
  [dense summaries](contact-correct-evidence/dense-sweep-summaries.json).
- **Rendered skin:** the first 17-phase ch07/right configuration has surface
  intersections of 6.811–8.707 mm, including the browser's 6.81 mm measurement
  after the load fix. The mesh is nonwatertight, so the volume-containment
  result remains unavailable. The region is `Ch07_Body`; this mesh includes
  the hand, so it does not specifically identify torso or clothing penetration.
  No narrow intentional palm exclusion is supplied by this host. Other rigs'
  skin sweeps are deliberately not claimed after this first failing case.
  See [posed-skin samples](contact-correct-evidence/posed-skin-sweep.json).
- **Natural movement and remaining scope:** depth/cross-body perturbation
  suites, frame-partition equivalence and full visual motion approval remain
  unfinished. Passing the authored loop's socket tests is insufficient.
  The current `iterations` field counts candidate evaluations (298 in the
  retained runtime frames), rather than the plan's maximum 32 settling
  iterations. That contract is also not certified by these tests.

Package verification: regenerated only six owned source entries plus matching
runtime/declaration files, installed from the persistent patch with
`pnpm install --offline --frozen-lockfile --ignore-scripts`, and compared all
18 installed artifacts to the authored package. All matched. The final
`npm run check` reports zero errors and zero warnings. The task-owned preview
server was stopped; port 5173 was not modified.

## Next implementation boundary

The remaining elbow issue requires choosing a continuous elbow/torso route
over the loop, rather than independently selecting the lowest-cost pose each
frame. Preserve the fixed authored staff and validate intermediate samples
while doing that. The grip also needs posed-surface fitting and a narrowly
identified palm-contact region; conservative bone capsules alone cannot
certify skin contact. Keep the failing sweep assertions intact and rerun the
same cases after either correction. These are solver gaps, not evidence that
the human movement is physically impossible or that motion capture is required.

## Package ownership

The task uses a private copy of the already-patched scene package for editing,
and a separately extracted pristine 0.1.6 package for selective patch creation.
Main's installed package and port 5173 remain untouched during implementation.
Only changed source files and their matching runtime/type artifacts may enter
the persistent package patch; unrelated generated distribution churn is banned.
