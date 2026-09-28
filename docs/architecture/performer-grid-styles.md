# Performer Grid Styles

Status: design agreed with Austen on 2026-09-27. Groundwork not started.

## Two ways to size the grid

Spinners size their space in two ways, and Austen treats both as valid:

- **Isolation style.** The staff sets the grid. Each hand sits half a staff
  length from the grid center, so a staff pointing in ends exactly on the
  center point and isolations pin there. The look is precise and geometric.
- **Extension style.** The body sets the grid. The hands sit where the arms
  reach, and a smaller staff spins on the larger grid. The look favors full
  extension and body mechanics.

Both stay available. Each performer carries two numbers, a hand radius (grid
center to hand point) and a staff length, and its grid style picks them.

| Style     | Hand radius               | Staff length                          |
| --------- | ------------------------- | ------------------------------------- |
| Isolation | Half the staff length     | The performer's chosen length         |
| Extension | Set from the body's reach | The chosen length, capped by the body |

The extension rule for the hand radius is open and gets set from pictures of
the whole pose. The cap is the hug fit from `fitStaffLengthForHug`
(`src/lib/shared/3d/domain/performer-reach-measurements.ts`): the longest
staff the body can hold when the chest turns side-on, about 67 cm on ch07.
The real staff recheck in
[performer-contact-review.md](performer-contact-review.md) measured that
length on today's grid and found 85 to 87% fewer chest hits than at 86 cm.

## What the code does today

Neither style exists yet, and three separate sources decide the sizes.

- **Hand radius.** `GRID_RADIUS_3D` is a fixed 0.52 m in
  `src/lib/shared/3d/domain/constants/plane-transforms.ts`, set as 0.6 of a
  34-inch staff, with a TODO to follow the user's proportions.
  `prop-state-interpolator.ts` and `plane-coordinate-mapper.ts` place every
  hand with it, `viewer-camera-framing.ts` keeps its own copy of the number,
  and `CANVAS_TO_3D_SCALE` derives from it with no consumers. It matches
  neither style: a 34-inch staff pointing in stops about 9 cm short of the
  center, and from a square stance the far cross-body point sits 78 to 81 cm
  from the shoulder against a 61 to 64 cm reach (Cause 2 in the performer
  review).
- **Drawn grid.** The scene-3d package's `calculateSceneDimensions` sizes the
  drawn rings from the global staff length only: hand ring at 0.6 of the
  staff, grid at the staff plus 25 cm. Height scales the body and puts the
  grid center at shoulder height (0.82 of height). `GridPlane` draws these
  rings unless its host passes a radius, so they follow the global staff
  setting while the hands stay at 0.52 m.
- **Staff length.** Each consumer picks its own:
  - `LiveSequencePerformer3D` draws the hug fit unless a length is pinned.
  - The export worker reads the performer's `staffLengthCm` setting, else
    the global 34-inch length.
  - `PerformerRig` checks collisions with `propLength` when given, else the
    global length. `Avatar3D` uses the prop's contact length in
    prop-authoritative mode, else the global length.
  - The contact scoreboard measures a fixed 86.36 cm.
  - The LED Baton always draws at 86.36 cm. The Fire Staff and the
    procedural builds draw the length they are given.

## Groundwork, in order

Today's picture stays the same until step 4 turns a style on.

1. **Hand radius per performer.** Hand placement in
   `prop-state-interpolator.ts` and `plane-coordinate-mapper.ts` takes the
   radius from the performer, defaulting to 0.52 m, and the camera framing
   reads the same value instead of its copy. Learn and lab diagrams that draw
   their own grids keep the constant. Acceptance: the interpolator tests and
   the contact scoreboard counts stay unchanged. This step touches hand
   placement in every 3D scene, so it waits until no other session is
   changing the performer.
2. **One staff length per performer.** Resolve it once and hand the same
   value to the drawn prop, the collision checks (through `propLength` and
   the contact length), the export worker and the scoreboard.
3. **A grid style setting.** Add it to `PerformerSettings` beside
   `staffLengthCm`, with a scene-wide default in the settings cascade. The
   default keeps today's fixed radius until pictures approve a style.
4. **The two rules.** Small pure functions beside `fitStaffLengthForHug`.
   The scoreboard runs both styles so neither regresses. The LED Baton gets
   a length scale like the Fire Staff's, which is a scene-3d patch change.

Judge each style by pictures of the whole pose with a real build (the Fire
Staff, the LED Baton, or a day staff once one exists) at that performer's
staff length.

## Open questions

- The extension style's hand radius: one fraction of reach for every point,
  or a radius per point, since the cross-body points are the farthest.
- Whether the hug fit also caps the staff in the isolation style, where the
  hands sit closer in.
- Formation spacing when performers' grids differ in size.
