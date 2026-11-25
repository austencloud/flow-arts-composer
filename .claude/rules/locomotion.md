---
paths:
  - "src/lib/shared/3d/**/*"
  - "src/lib/features/stage/**/*"
  - "packages/camera-3d/**/*"
---

# Locomotion Ownership and Evidence (ENFORCED)

Body motion comes from Mixamo clips: read
`.claude/rules/body-motion-from-clips.md` first. It wins over anything below
that suggests making motion in code.

Read `docs/architecture/locomotion-research-canon.md` before changing walking,
gait timing, exact steps, starts, stops, turns, pivots, sidesteps, crossover,
grapevine, foot contacts, IK, retargeting, terrain locomotion, or motion matching.
That document owns the research and decision ledger. Do not duplicate its
bibliography here.

## Ownership

- `src/lib/shared/3d/locomotion/destination-walk-plan.ts` owns exact geometric
  destination and step-count intent.
- `@austencloud/scene-3d` `LocomotionAnimator` owns animation time, gait phase,
  clip/contact selection, stride scaling, and terminal execution. Its repository
  patch is `patches/@austencloud__scene-3d@0.1.6.patch`.
- `@austencloud/scene-3d` `FootPlanter` owns late contact locks and leg IK. It is
  a correction layer, not a step planner or animation generator.
- Stage score time owns authored musical events. `GaitTimingPlan` is the seam for
  explicit plant times; verify its current implementation before use.
- `src/lib/features/stage/locomotion/motion-matching/` is the only allowed owner
  for motion-database feature extraction and search. It is unfinished until a
  runtime consumer builds and queries the database.
- Gait diagnostics grade the output. They do not control it.

Do not add a parallel gait clock, destination planner, foot planter,
motion-matching database, or Stage-only locomotion solver.

## Required distinctions

Keep these states explicit in specs and reports:

- research reference;
- adopted architecture;
- task-branch prototype;
- shipped behavior verified in `main`;
- live visual proof on each supported rig.

A paper, design, or test fixture does not prove runtime support. Re-verify
symbols, consumers, tests, and current branch state before describing a
capability as implemented.

## Behavior rules

- An exact-step move reaches the destination on the requested footfall without
  an endpoint snap or hidden settlement step.
- A stop is a terminal transition with braking and declared final placement,
  not a frozen loop phase or zero velocity.
- A turn uses authored or data-covered foot placement and support. Never rotate
  the root under two stationary feet and call that a turn.
- Sidestep, front crossover, back crossover, and grapevine are distinct pattern
  classes. Negative leg order is allowed when the plan intentionally crosses;
  geometry and continuity decide whether a collision occurred.
- FootPlanter may preserve declared contacts. It must not invent a missing stop,
  turn, or grapevine.
- Motion matching cannot select behavior absent from its database. Warping and
  inertialization correct bounded mismatch; they do not supply missing motion.
- Musical cadence does not imply exact plant times. Use an explicit score-time
  schedule and report plant-time error.
- Do not import, convert, train on, or ship a motion dataset until the source,
  media, performer, code, model, modification, commercial-use, redistribution,
  and attribution terms are recorded.

## Verification

Every locomotion change needs focused automated checks for its silent contracts
and live Walk Lab inspection in the approved browser setup. Inspect the complete
maneuver on every supported rig from useful side, front, and quarter views.
Measure steady travel and terminal settle separately. Zero endpoint error does
not excuse slip, twitching, teleporting, interpenetration, or implausible weight
transfer.

When a result changes an owner, adoption status, accepted dataset, or rejected
assumption, update the research canon in the same scoped work.
