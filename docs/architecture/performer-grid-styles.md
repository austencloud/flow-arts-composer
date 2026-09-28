# Performer Grid Styles

Status: design agreed with Austen on 2026-09-27, with his answers to the first
three questions recorded below. Groundwork not started.

## Two ways to size the grid

Spinners size their space in two ways, and Austen treats both as valid:

- **Isolation style.** The staff sets the grid. Each hand sits half a staff
  length from the grid center, so a staff pointing in ends exactly on the
  center point and isolations pin there. The look is precise and geometric.
- **Extension style.** The body sets the grid. The hands sit where the arms
  reach, and a smaller staff spins on the larger grid. The look favors full
  extension and body mechanics.

Both stay available. Each performer carries a staff length and a hand
distance (grid center to hand point), and its grid style sets them. The hand
distance can differ by hand and by direction.

| Style     | Hand distance                                | Staff length                                 |
| --------- | -------------------------------------------- | -------------------------------------------- |
| Isolation | Half the staff length in every direction     | The chosen length, under a looser body limit |
| Extension | The arm's full reach, per hand and direction | The chosen length, capped by the body        |

The extension cap is the hug fit from `fitStaffLengthForHug`
(`src/lib/shared/3d/domain/performer-reach-measurements.ts`): the longest
staff the body can hold when the chest turns side-on, about 66 to 67 cm on
the two rigs. The real staff recheck in
[performer-contact-review.md](performer-contact-review.md) measured that
length on today's grid and found 85 to 87% fewer chest hits than at 86 cm.
The isolation limit waits on a focused session with Austen.

## Extension: full reach

Austen, 2026-09-27: in the extension style the hands sit as far out as the
anatomy allows.

On the bind pose of both rigs at 1.905 m, the arm reaches 58 cm (ch07) and
59 cm (ch18) from the shoulder to the grip point, which sits 0.65 of the way
from the wrist to the middle knuckle as in `AvatarAnimator`. The 61 to 64 cm
reach in the performer review runs to the knuckle. A throwaway probe that
builds each rig the way the contact scoreboard does took these measurements.

The wall plane sits 31 to 33 cm in front of the shoulders, so a hand at full
reach traces a circle of about 49 cm radius around the point in front of its
shoulder. That point sits 20 to 22 cm to the hand's own side of the grid
center and 3 to 4 cm below it, so the distance from the grid center changes
with direction. Turning the chest swings the reaching shoulder forward around
the spine. That lengthens the reach across, up and down, and past about 30°
it shortens the reach outward.

| Chest turn                     | Across   | Up       | Down     | Out      |
| ------------------------------ | -------- | -------- | -------- | -------- |
| Square                         | 27 to 29 | 41       | 47 to 49 | 69 to 72 |
| 30°                            | 35 to 37 | 47 to 49 | 54 to 55 | 71 to 75 |
| 60°                            | 45 to 46 | 52 to 54 | 59       | 67 to 71 |
| Side-on (87°, the planner cap) | 55 to 56 | 53 to 56 | 61       | 58 to 62 |

The table gives centimeters from the grid center to the grip at full reach,
over both rigs. Across points toward the other hand's side, and out points
toward the hand's own side. With the chest square, a hand reaches today's
0.52 m only on its own side and falls 3 to 25 cm short up, down and across.

In dual wheel each wheel sits 18 to 20 cm outside its shoulder, so the reach
circle has a radius of 54 to 57 cm and its center lies within about 4 cm of
the grid center. With the chest square the distance there stays between 50
and 61 cm all round.

So the hand distance depends on the hand and the direction, and step 1
carries it that way. How much chest turn a full reach may use gets set in
step 4 from pictures.

## Isolation: the staff limit

Austen, 2026-09-27: a body limit applies to isolation staffs too, set
reasonably, since isolation staffs can get pretty big. He wants a focused
session on it before it becomes a rule. Material for that session:

- The hand sits half a staff from the center in every direction, so the
  longest staff a body allows is twice its reach in the hardest direction the
  sequence visits. From the table above that gives 54 to 58 cm with the chest
  square, where across is the short way, 91 to 92 cm with the chest turned
  60°, and 106 to 111 cm fully side-on.
- These limits hold for one hand. Turning the chest toward one hand pulls the
  other shoulder back, so pairs of hands need pictures.
- The hug fit is a second limit. The real staff recheck found chest hits
  climbing quickly above it on today's grid, so the session should weigh both.

## Formation spacing

Two neighbors' staffs can just touch when the distance between them equals
the sum of their reaches along the line between them. A performer's reach in
a direction is the farthest a staff tip gets from where they stand: the hand
distance plus half the staff. Performers with different grid sizes each bring
their own reach, and any gap beyond the sum is a staging choice.

The plane sets the shape. In the wall plane the tips sweep a disc facing the
audience 30 cm in front of the body, wide sideways and shallow front to back.
In dual wheel they sweep two discs 40 cm out to each side, long front to back
and thin sideways. When the planes are unknown, use the widest reach in every
direction.

| Style                            | Wall plane, sideways | Dual wheel, front or back |
| -------------------------------- | -------------------- | ------------------------- |
| Today (0.52 m, 86.36 cm staff)   | 95 cm                | 95 cm                     |
| Isolation                        | The staff length     | The staff length          |
| Extension with the hug fit staff | 103 to 104 cm        | 86 to 93 cm               |

Side by side in the wall plane, neighbors need 1.90 m today, twice the staff
in isolation, and 2.05 to 2.09 m in extension. In dual wheel a column or a
facing pair needs 1.90 m today, twice the staff in isolation, and 1.73 to
1.79 m in extension.

The presets in the scene-3d package's `src/lib/config/formation-presets.ts`
use fixed distances. Checked on both rigs in the wall plane and dual wheel:

- **Line, Grid and two-performer V-Shape** stand 2.0 m apart side by side.
  The wall plane clears by 10 cm today and by 27 cm in isolation with an 86 cm
  staff, and extension needs 2.05 to 2.09 m. Dual wheel clears.
- **Side-by-Side** stands 1.8 m apart. The wall plane falls 10 cm short today,
  clears by 7 cm in isolation with an 86 cm staff, and needs 2.05 to 2.09 m in
  extension. Dual wheel clears.
- **Tunnel Stack** (1.2 m front to back) and **Facing Each Other** (1.0 m
  apart) clear in the wall plane and fall short in dual wheel.
- **Back-to-Back** stands the pair 0.6 m apart along the line they face, so
  their bodies no longer overlap. The wall plane clears. In dual wheel the
  staffs still reach into each other's space, because a back-to-back pair
  needs the same 1.90 m as a facing pair today.
- **Circle** turns every performer to face the center. Five to eight
  performers' staff tips then reach about 2 cm into each other's space today,
  so the circle needs 1 to 2% more radius. Isolation with an 86 cm staff clears
  by 11 to 12 cm, and extension needs 8 to 9% more radius.
- **Diagonal**, **Stage L/R** and V-Shape with three or more clear in every
  style.

Two preset bugs were fixed on 2026-09-28. Back-to-Back put both performers on
the same spot, and Circle turned the performers at the sides to face outward.
The viewer had a bug of its own. It moved performers into a new formation
without turning them unless reduced motion was on, and undo and reloaded
scenes dropped the facings too. Now each performer turns to its slot's facing.

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
  from the shoulder against a 61 to 64 cm reach to the knuckle (Cause 2 in
  the performer review).
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

1. **Hand distance per performer.** Hand placement in
   `prop-state-interpolator.ts` and `plane-coordinate-mapper.ts` asks the
   performer for the hand distance by hand and direction, defaulting to
   today's 0.52 m everywhere. The camera framing reads the performer's largest
   hand distance instead of its copy. Learn and lab diagrams that draw their
   own grids keep the constant. Acceptance: the interpolator tests and the
   contact scoreboard counts stay unchanged. This step touches hand placement
   in every 3D scene, so it waits until no other session is changing the
   performer.
2. **One staff length per performer.** Resolve it once and hand the same
   value to the drawn prop, the collision checks (through `propLength` and
   the contact length), the export worker and the scoreboard.
3. **A grid style setting.** Add it to `PerformerSettings` beside
   `staffLengthCm`, with a scene-wide default in the settings cascade. The
   default keeps today's fixed radius until pictures approve a style.
4. **The two rules.** Small pure functions beside `fitStaffLengthForHug`.
   Isolation gives half the staff in every direction. Extension gives the full
   reach for each hand and direction, with the chest turn that pictures
   approve. The scoreboard runs both styles so neither regresses. The LED
   Baton gets a length scale like the Fire Staff's, which is a scene-3d patch
   change.
5. **Spacing from reach.** Formations space each pair of neighbors by the sum
   of their reaches along the line between them, using their planes, in place
   of the fixed preset distances. This is also a scene-3d patch change.

Judge each style by pictures of the whole pose with a real build (the Fire
Staff, the LED Baton, or a day staff once one exists) at that performer's
staff length.

## Still open

- The isolation staff limit, after the focused session with Austen.
- How much chest turn the extension style's full reach may use, set in step 4.
