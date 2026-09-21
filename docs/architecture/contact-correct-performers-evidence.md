# Contact-correct performer evidence

Status: blocked by failed physical acceptance checks; preserved on
`codex/contact-correct-performers`, unmerged. This is an implementation
checkpoint, not a completed contact-correct performer.

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
