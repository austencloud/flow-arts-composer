---
status: active
value: null
effort: null
work_state: verification
remaining: Verify the landed Flow Fest drive-in against gate geometry, tree visibility, arrival choices, and saved campsite return.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Flow Fest sim — sub-project 1 "Drive in" (design)

Date: 2026-09-04. Roadmap:
`docs/superpowers/specs/active/2026-09-02-flow-fest-arrival-arc-roadmap.md`
§"### 1. Drive in". This document records the decisions the code implements;
it is not a review gate.

## Slice

Loadout screen → in the driver's seat at the west edge of the surveyed square →
887 m of Camden College Corner Road → slow left turn into the drive → pull off
on the right shoulder short of the fence line → get out. The existing
`gate-check-in` phase takes over on foot, 30 m from the check-in zone.

Out of the slice, stated so nobody looks for them: engine and road-noise audio,
a seated driver visible through the glass, headlights, physics for queued cars
(visual only, like every parked car in the sim today), trees on the west
corridor (forest bounds stop at x = −160), props as cargo geometry.

## Primitive discovery (required report)

- **Extending** the EUC ground-vehicle owner
  (`src/lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.ts` +
  `services/flow-fest-electric-unicycle-drive.ts`): the input, angle, and
  collision-reconcile primitives move to a shared
  `domain/flow-fest-ground-vehicle.ts`; the EUC keeps its names as aliases;
  the car (`domain/flow-fest-car.ts`, `services/flow-fest-car-drive.ts`) is a
  second vehicle on the same `PhysicsProvider` substep pattern.
- **Extending** the camera owner (`packages/camera-3d`
  `UnifiedCameraController.svelte`) with optional third-person boom props
  (distance, min/max, height, look-at height). No second camera.
- **Reusing** `settleFlowFestParkedCarOnGround`,
  `flowFestParkedCarPlacementMatrix`, the parked-car GLB normalisation and
  `useGltf` draco/meshopt loader options, `identifyFlowFestPlanLocation`
  (surface grip), `SegmentedControl` (departure), `ActionButton` (depart), the
  page's glass-panel / choice-grid composition (camp-choice precedent).
- **Composing** `SegmentedControl`, `ActionButton`, `CHARACTER_DEFINITIONS`,
  the car catalog and the budget line in new feature component
  `src/routes/test/flow-fest-sim/FlowFestLoadoutPanel.svelte`.
- **Creating** the loadout data model (`domain/flow-fest-loadout.ts`) and the
  car catalog with `flow-fest-car.ts` as owner; closest match (EUC config)
  differs because a car has mass, power, a wheelbase, a price and a cargo
  volume, and the EUC has none of them.

## Road

`FLOW_FEST_CAMDEN_COLLEGE_CORNER_ROAD` becomes the 31-point clip of ODOT TIMS
feature 3019609 (network linear feature `CPRECR00024**C`) to the ±512 m
terrain square: enters at (−512, 38), reaches the camp entrance
(328.2557, −98.1551) at station 886.94 m, and leaves at (445.04, −245.77) at
station 1075.97 m. The retrieved ODOT attributes are recorded on
`FLOW_FEST_PUBLIC_ROAD_SOURCE` as data (`surfaceWidthFeet` 18,
`roadwayWidthFeet` 20, two lanes, 45 mph, function class 6, ADT 582 in 2025,
pavement `FLEX`, raw surface code `G` — not decoded). The rendered width stays
the authored 6.8 m so the existing production-geometry proof survives; the
surveyed 5.49 m surface is recorded, not drawn.

Grade profile (graded terrain, 25 m samples): flat from the west edge (27.8 m
→ 26.4 m over 520 m), then a real descent to the gate — 9–10 % between
stations 660 and 830 — arriving at 6.5 m at the entrance; a 12 % climb starts
at station 1055, past the gate. Spawn: station 12 m → (−500.01, 37.46), heading
1.6160 rad (`atan2(dx, dz)` of the road's first segment).

## Gate geometry (derived from `FLOW_FEST_LOWER_ENTRANCE_BASIS`)

Drive-local frame: origin = entrance on the road centreline, `depth` inward
(−0.8155, −0.5787), `right` (0.5787, −0.8155). Fence line at depth 8.5 with a
±6 m gap; loop road crossing at local (4.5, 12.0); gatehouse centred at
(1.0, 25.5), 8.2 × 4.8 m. The camp is to the LEFT of the road for a driver
travelling toward increasing station (the arrival direction).

- `FLOW_FEST_GATE_PULL_OFF`: local (right 9.0, depth 5.2), nose inward → world
  ≈ (329.22, −108.50), heading −2.1881 rad. Rear bumper 2.95 m from the road
  centreline (the ODOT surface half-width is 2.74 m; the entrance flare is
  gravel to 7.5 m), nose 7.45 m in, clear of the fence at 8.5 m.
- `FLOW_FEST_GATE_QUEUE_SLOTS`: local right 1.0, depths 18.5 / 12.5 / 6.5,
  nose inward. Departure decides how many are filled (0 / 1 / 3).
- `FLOW_FEST_GATE_ARRIVAL_RADIUS_METERS = 30` around the entrance point:
  `drive-in` completes when the player exits the car inside it with local
  depth ≥ 0 (off the public road).

## Car model (authored, class-typical; none of it is surveyed)

| id               | mass kg | power kW | launch m/s² | brake m/s² | CdA m² | steer rad | cargo L | price $ |
| ---------------- | ------- | -------- | ----------- | ---------- | ------ | --------- | ------- | ------- |
| ace-hatchback    | 1100    | 75       | 3.4         | 8.0        | 0.70   | 0.50      | 270     | 1800    |
| fairheaven-sedan | 1500    | 80       | 3.2         | 7.5        | 0.85   | 0.48      | 570     | 2400    |
| fairheaven-wagon | 1600    | 85       | 3.0         | 7.5        | 0.85   | 0.48      | 1300    | 2600    |
| bokaroo-suv      | 1950    | 110      | 2.8         | 7.0        | 1.20   | 0.45      | 1100    | 3200    |
| lightbody-pickup | 2050    | 100      | 2.6         | 7.0        | 1.30   | 0.42      | 1800    | 3000    |
| t2-camper        | 1350    | 40       | 1.9         | 6.0        | 1.40   | 0.46      | 2000    | 4500    |

Wheelbase and track come from the parked-car catalog's measured wheel
contacts, not from this table.

`stepFlowFestCar(spec, state, input, dt, environment)` per 1/60 s substep:

- drive accel = `min(power·throttle / (mass·max(|v|, 2)), launch·throttle·grip)`
  (traction-limited at launch, power-limited at speed); reverse = 60 % of
  launch, capped at 3 m/s; `throttle < 0` only reverses below 0.18 m/s (the
  shared input layer already turns S into brake above that).
- resistances: rolling `0.015·g·(2 − grip)`, aero `½·1.225·CdA·v²/mass`,
  engine braking 0.35 m/s² when coasting (automatic, cannot stall), brake
  `brake·min(1, grip·1.1)·brakeDecel`, gravity `−9.81·gradeSine`. Braking and
  coasting use `moveTowards` so a car stops dead instead of dithering.
- steering: bicycle model, yaw rate `v·tan(δ)/L`. Target
  `δ = steer·min(δmax, atan(6·grip·L / v²))` — the speed-sensitive cap is the
  "mild understeer"; δ slews at `steerRate/(1 + |v|/15)` rad/s (hatchback 2.8,
  pickup 1.8) and returns to centre at 3.5 rad/s.
- weight transfer (visual only): body pitch `+a_long·pitchGain` (nose lifts
  under throttle, dives under braking), body roll `+a_lat·rollGain` (rolls to
  the outside of the turn), both damped at 6/s.
- state: `{speed, heading, steering, bodyPitch, bodyRoll, odometer}`; wheel
  spin is derived from the odometer by the visual.

Grip: `identifyFlowFestPlanLocation` kind `public-road` / `internal-drive` /
`landmark` → 1.0; `region` / `site` (grass) → 0.65 ("loose gravel shoulder").
World edge: the drive service refuses movement that would leave ±508 m, zeroes
speed and reports "Edge of the surveyed square". The gate overshoot has no
wall: 189 m of real road remain to the east edge to turn around on.

## Physics while driving

The player capsule (r 0.3, half-height 0.55) is swapped in place for
`Cuboid(length/2, 0.6, width/2)` with `collider.setShape`, and the kinematic
body receives `setNextKinematicRotation(rotY(heading − π/2))` every frame so
the box's long axis follows the heading (`nose = local +X`, the parked-car
placement convention). On exit the capsule is restored and the parked car gets
a static box body. Boarding needs the on-foot player within 1.8 m of the
driver's door point (left side); exiting needs |v| < 0.5 m/s. The EUC rides as
cargo if it is within 4 m of the car when boarding, otherwise it stays where it
was parked; on exit it is set down 1.2 m behind the rear bumper.

## Camera

Third person behind the car: distance 7.5, min 3, max 14, height 2.4, look-at
1.0, pitch 0.16; `externalYaw` follows the car heading like the EUC. The walk
scene bumps `cameraRevision` on board and exit so the boom props re-seed.

## Loadout and progress

`FlowFestLoadout = {characterId, carModelId, paintIndex, departure, veteran,
props}`. `veteran` and `props` are data only (no consequence yet, so no
control). Energy is not on the loadout: it lives on progress as
`energyPercent`, seeded from the departure profile on `depart`. The budget is
derived, never stored: `flowFestBudgetFor(carModelId)` returns `{savingsUsd,
ticketUsd, carUsd, remainingUsd}` from the economy placeholders, authored:
savings $4,800, ticket $320 (not the real ticket price). A car the budget
cannot cover, or one without room for the wheel, shows on the loadout screen
but cannot be chosen. Departure → arrival: early "THU · 3:05 PM" (afternoon
profile, energy 70 %, 0 queued cars), midday "THU · 4:37 PM" (afternoon, 85 %,
1), late "THU · 7:48 PM" (golden-hour profile, 95 %, 3). Only the late choice
is a real lighting change; early reuses the afternoon profile with its own
clock label. Driving drains 3 % energy per minute (authored; the weekend
economy will tune it). The page charges it in driven time: each frame the car
moves banks its seconds (capped the way the car caps a slow frame) and
`drain-energy` fires once 5 s are banked, so a background tab drains nothing.

Progress version 3: phases `loadout` → `drive-in` → `gate-check-in` → …;
actions `depart {loadout}` and `arrive-at-gate`; state gains `loadout` and
`energyPercent`. A late departure shifts every afternoon-based phase to
golden-hour; snapshot validation knows that. Old version-2 sessions restart at
the loadout screen.

The gate queue is `flowFestGateQueueCars(count)` in `flow-fest-camp-plan.ts`:
up to three surveyed slots on the entrance drive, nearest the gatehouse first,
each a real catalogue body in its own paint. The production layer settles them
on the graded terrain beside the lot's cars and the walk scene gives each a
static collision box, so a queue is something you can hit. While the arrival
light holds, the HUD clock shows the departure's arrival time instead of the
site clock, and the loadout's character is the on-foot body after the car.

Mobility snapshot version 2 adds `car: {modelId, paintIndex, x, z,
headingRadians, driving} | null`. While `driving`, `player` and `wheel` ride
with the car.

## Tests (real numbers)

Road clip length 1075.97 m / entrance station 886.94 / spawn heading 1.6160;
0–15 mph hatchback vs pickup; braking distance from 20 m/s (hatchback ≈ 25 m
on tarmac, longer on grass); the steering cap at 20 m/s yields a ≥ 60 m
radius; the gate pull-off lands inside the arrival radius and off the road;
progress chain loadout → drive-in → gate-check-in with a real loadout; the
late-departure moment shift; snapshot v2 round-trip; loadout affordability and
cargo (EUC 60 L fits the hatchback's 270 L).

## Landing notes (2026-09-05)

- **A dead frame loop, not a camera bug.** The first in-session run of
  loadout → "Hit the road" left the car ignoring W with the camera parked at
  the gate. The cause was the EUC mounted-pose rig: it still called
  `KneeHingeAxisCalibrator.compute(rootRestDir, middleRestDir)` against
  scene-3d 0.1.6's `compute(chain, referenceAxisWorld)`, so binding a mounted
  rider threw inside the rider's frame task. Threlte 8 drives frames through
  `renderer.setAnimationLoop`, and three.js requests the next frame only after
  the loop callback returns, so one throw stopped every task for good: no
  camera, no car physics, `controllerReady` stuck at false, and
  `requestAnimationFrame` never called again. Every snapshot that starts
  mounted on the wheel (the fresh default, and every "Back to the loadout")
  hit it. The rig now builds the chain and hip-line reference the package
  expects, and a calibration throw becomes an `unsupported-rig` diagnostic
  instead of propagating. Fifteen previously red rig tests are green; one new
  test covers the guard.
- **Verified after the fix on a fresh load:** start over → mounted rider
  `pass: true`, both knees forward, no errors, frames flowing → "Hit the road"
  → controller ready, W drives (throttle 1, 4.9 m/s after ten frames), the
  chase view shows the car and road, the objective reads 811 m at the spawn.
  In-car HUD checked at 1440×900, 1920×1080, 2560×1440 and 3840×2160.
- **Carry-overs.** The canvas sits 10 px short of the viewport width at every
  tier (`scrollWidth = innerWidth − 10`); main reads the same on the primary
  server, so it predates this slice. The mounted rider ignores the chosen
  character. The chase-camera boom props in `packages/camera-3d` only run
  from the primary checkout, so they are checked there after integration.
  Engine and road-noise audio are deferred; the west corridor has no trees.
