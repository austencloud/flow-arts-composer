# Performer Grid Styles

Status: design agreed with Austen on 2026-09-27, with his answers to the first
three questions recorded below. Groundwork step 1 done on 2026-09-28, and the
isolation staff cap settled the same day; steps 2 to 6 not started.

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

| Style     | Hand distance                                | Staff length                             |
| --------- | -------------------------------------------- | ---------------------------------------- |
| Isolation | Half the staff length in every direction     | The chosen length, capped by the hug fit |
| Extension | The arm's full reach, per hand and direction | The chosen length, capped by the hug fit |

Both caps are the hug fit from `fitStaffLengthForHug`
(`src/lib/shared/3d/domain/performer-reach-measurements.ts`): the longest
staff the body can hold when the chest turns side-on, about 66 to 67 cm on
the two rigs. The real staff recheck in
[performer-contact-review.md](performer-contact-review.md) measured that
length on today's grid and found 85 to 87% fewer chest hits than at 86 cm.
The isolation section below shows why isolation takes the same cap.

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
reasonably, since isolation staffs can get pretty big. On 2026-09-28 he
looked at isolation pictures at five staff lengths beside today's grid and
took the recommended cap: the hug fit, the same limit extension uses.

The contact scoreboard measured isolation, each hand half a staff from the
center, at seven staff lengths on both rigs. Counts are ch07 / ch18, and a
beat has 60 frames.

| Staff                          | Beats with head or torso contact | Head frames | Torso frames  | Frames turned past 60° |
| ------------------------------ | -------------------------------- | ----------- | ------------- | ---------------------- |
| Today (0.52 m hands, 86.36 cm) | 115 / 141                        | 64 / 149    | 644 / 1,273   | 2,633 / 2,614          |
| 61 cm                          | 86 / 118                         | 35 / 136    | 871 / 1,210   | 1,379 / 1,364          |
| 67 cm, the hug fit             | 77 / 99                          | 16 / 130    | 1,002 / 1,360 | 1,818 / 1,810          |
| 76 cm                          | 98 / 122                         | 84 / 192    | 1,332 / 1,709 | 2,018 / 1,994          |
| 86 cm                          | 101 / 134                        | 101 / 214   | 1,339 / 1,644 | 2,398 / 2,372          |
| 96 cm                          | 122 / 160                        | 72 / 182    | 1,431 / 1,747 | 2,548 / 2,522          |
| 106 cm                         | 154 / 182                        | 65 / 153    | 1,934 / 2,179 | 2,633 / 2,616          |
| 116 cm                         | 156 / 182                        | 67 / 157    | 2,331 / 2,896 | 2,777 / 2,748          |

- The hug fit has the fewest beats with contact, and a quarter of today's
  head frames on ch07. Each longer staff adds beats with contact, and from
  96 cm there are more than today.
- Shorter staffs bring the hands closer together, so the forearms crowd:
  they pass within 4 cm of each other on 164 / 122 frames at 67 cm, against
  97 / 68 today.
- No length clears the together moves. With both hands at one point the
  chest turns side-on, and each staff's inner end reaches the grid center.
  G beat 2 has a staff in the head or torso on 30 to 41 of its 60 frames at
  every isolation length, and on 1 today, where the inner ends stop 9 cm
  short of the center.
- Moving the wall plane forward does not clear them either. With the grid
  10 cm farther out (offset 0.40 m instead of 0.30 m) at 67 cm, head frames
  fell from 16 / 130 to 5 / 11, torso frames barely moved (1,002 / 1,360 to
  967 / 1,306), and hands sat more than 3 cm off the staff on 2,032 / 2,776
  frames instead of 1,068 / 1,624.
- The reach sets an outer bound: twice the reach in the hardest direction a
  sequence visits, which is 54 to 58 cm with the chest square (across is the
  short way), 91 to 92 cm with the chest turned 60°, and 106 to 111 cm fully
  side-on. A hug-fit staff therefore needs some chest turn at the cross-body
  points.

### The body clears the isolation point

Austen, 2026-09-28: in a strict isolation the point being isolated around has
to be empty space, because the staff's end occupies it. A performer who turns
side-on cannot stand in that point, so the chest moves away from it and the
point the audience sees the isolation around stays open for the staff.

Before step 5 the performer could not do this. The chest only turned, and
hard-beat displacement moves the staff and hand together, never the body. The
reach lean in the scene-3d `AvatarAnimator` leans toward an arm target, and
`avatar-head-clearance-policy.test.ts` holds it at 0 so unreachable targets
cannot pull the spine into their path; this move goes the other way, away
from the point. Step 5 below describes it.

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

- **Hand distance.** Each performer holds a hand distance for each hand,
  which may vary by direction
  (`src/lib/shared/3d/domain/performer-hand-distance.ts`). Every performer
  keeps the default, `GRID_RADIUS_3D`: a fixed 0.52 m in
  `src/lib/shared/3d/domain/constants/plane-transforms.ts`, set as 0.6 of a
  34-inch staff. `prop-state-interpolator.ts` places each hand at its
  performer's distance, and the opening camera shot and the view presets
  frame the lead performer's largest distance. The labs, and
  `plane-coordinate-mapper.ts`, which serves only the labs and the loop check,
  use the fixed number; `CANVAS_TO_3D_SCALE` derives from it with no
  consumers. The fixed number matches neither style: a 34-inch staff pointing
  in stops about 9 cm short of the center, and from a square stance the far
  cross-body point sits 78 to 81 cm from the shoulder against a 61 to 64 cm
  reach to the knuckle (Cause 2 in the performer review).
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

1. **Hand distance per performer.** Done on 2026-09-28. Hand placement in
   `prop-state-interpolator.ts` asks the performer for the hand distance by
   hand and direction, 0.52 m by default. The opening camera shot and the
   view presets read the lead performer's largest hand distance in place of
   their copies of the number. `plane-coordinate-mapper.ts` turned out to
   serve only the labs and the loop check, so it keeps the constant with the
   Learn and lab diagrams. The contact scoreboard reports came out
   byte-identical for both rigs. The performer's `setHandDistance` is the seam
   steps 3 and 4 build on, and the isolation pictures can use it first.
2. **One staff length per performer.** Resolve it once and hand the same
   value to the drawn prop, the collision checks (through `propLength` and
   the contact length), the export worker and the scoreboard.
3. **A grid style setting.** Add it to `PerformerSettings` beside
   `staffLengthCm`, with a scene-wide default in the settings cascade. The
   default keeps today's fixed radius until pictures approve a style.
4. **The two rules.** Small pure functions beside `fitStaffLengthForHug`.
   Isolation gives half the staff in every direction, capped at the hug fit
   like extension. Extension gives the full reach for each hand and
   direction, with the chest turn that pictures approve. The scoreboard runs
   both styles so neither regresses. The LED Baton gets a length scale like
   the Fire Staff's, which is a scene-3d patch change.
5. **The body clears the isolation point.** Built on 2026-09-28 and turned
   on only in the staff-grip lab (`clear=shift` or `clear=step`). Every other
   host leaves it off, so their picture holds. `buildBodyClearanceTrack` in
   `src/lib/shared/3d/collision/body-clearance.ts` plans the move in score
   time. It samples the staffs at the performer's own length against
   ellipses for the chest, waist and pelvis, then picks one of 24 directions
   per sample. A turn penalty keeps the direction steady, and each move is
   widened over half a step and capped at 30 cm. The head stays out of the
   plan because it has its own dodge. `resolvePerformerContact` returns the
   track and the current offset when asked with `clearBody`, and
   `LiveSequencePerformer3D` hands it to `PerformerRig` through its
   `bodyClearance` prop. On the scene-3d side, a patch change, `Avatar3D`
   carries the offset from the grid frame into the world. `AvatarAnimator`
   then moves the hips before the spine, arms and head solve. With `shift`
   the feet stay planted and the legs bend back to them; with `step` the feet
   travel with the body. The move holds only while the performer stands
   still in legacy contact.

   The contact scoreboard at the hug fit (67 cm), ch07 / ch18: torso frames
   fell from 1,002 / 1,360 to 81 / 148, and head frames went from 16 / 130
   to 14 / 131. Hands sat more than 3 cm off the staff on 1,089 / 1,615
   frames, against 1,068 / 1,624 without the move. The planted feet drift at
   most 1.2 cm. The biggest move is 17 cm, almost always sideways: six corpus
   sequences move 12 to 17 cm, four more move 4 to 8 cm, and the rest stay
   put. The lab's own collision readout cannot judge this, because it
   measures the global 86.36 cm staff whatever length is drawn.

   Austen, 2026-09-28, after whole-pose pictures of both modes: full stepping
   is the long-term goal. Today's `step` slides the feet with the body. A real
   step, where the foot lifts, lands and takes the weight, is future work. He
   kept the head dodge as it is. Where the move leaves the staff tips in
   front of the face (I, together-same), the dodge was already at its 24°
   limit and now tips the head back instead of forward.

6. **Spacing from reach.** Formations space each pair of neighbors by the sum
   of their reaches along the line between them, using their planes, in place
   of the fixed preset distances. This is also a scene-3d patch change.

Judge each style by pictures of the whole pose with a real build (the Fire
Staff, the LED Baton, or a day staff once one exists) at that performer's
staff length.

## Still open

- Real stepping for step 5's `step` mode, and which hosts turn the body move
  on, with which mode, until real steps exist.
- How much chest turn the extension style's full reach may use, set in step 4.
- What the drawn grid rings show once a hand's distance varies by direction.
  They follow the global staff length today (see Drawn grid above).
