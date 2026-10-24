# Wave 2, run D: The fire jam as it really is

Workstream `Jam`. Folder `/Game/FlowFest/Assets/Jam/`, prefix `M_Jam_`, new
source files `FlowFestJam.h`, `FlowFestJam.cpp`, `FlowFestJamTests.cpp`.
WAITS for Austen's round-2 answers (questions 1 to 6 in
`polish-questions.md`). Starts after wave 1 merges (it needs the Season
clock, the Structures' dip station and archway, and the Juggling
component).

## Answers from Austen (the coordinator fills these in before launch)

- Q1 size and crowd: DEFAULT full rope, 20 to 30 inside at 22:30, 60 to
  90 around; thinning after 01:00.
- Q2 props: DEFAULT 60 percent fire, 25 percent LED, 15 percent unlit;
  one in eight inside is a juggler.
- Q3 safety stations: DEFAULT chair facing in, towel over its back, a
  fuel-can flame at every second or third station, a person in about half.
- Q4 other light: DEFAULT none at the circle; one work light at the dip
  station; the stage lit by itself. LED rope: DEFAULT a steady warm white
  with a slow colour drift, since Austen has not said.
- Q5 music: DEFAULT a DJ at the stage edge (visual only here: speakers,
  a DJ figure, a few lights on the stage; the Sound run does the audio).
- Q6 jugglers: DEFAULT tent by day, two to four inside the circle at night
  with unlit or LED clubs (fire clubs come in Jam 2), one passing pair
  outside the rope on the tent side.

## What the jam is, in Austen's words

"It's not a big-ass fire bonfire. It's a space where there's like an
amorphous blob which forms the circle, which is somewhat of a circle, but
somewhat of an oval and somewhat has whatever shape we put it. And around
the edges of it are LED rope that lines the ground. Every 15-20 feet or so
you'll see a safety station where there's a camping chair in front of a
safety towel that might have an eternal flame but might not. Around the
edges of that perimeter you'll see a bunch of chairs and wagons and
various props in those wagons. And miscellaneous people who are sitting
and watching on their blankets or their yoga mats or their inflatable
couches as people inside the circle are all dancing and moving around and
weaving in and out of one another. Well performing. And looking... either
out of the audience or lost in their own world in the center of the
circle. There are jugglers and flow artists."

The interview sizes the amoeba at about 51 by 32 m, long axis east-west,
centred near (90.5, -119.5), irregular (a rope laid on grass), with the
entrance at (79.5, -133) on the north-west side. The queue to get in runs
from the walk-in at (111.8, -141.9) west along the north edge to the dip
station at (70.9, -141.9), then around the north-west corner to the
entrance. The fire pit that exists in the game today does not exist at the
real event.

## You own

- In `FlowFestWorld.cpp`: the `if (Fire)` block of `BuildFestivalLandmarks`
  (delete the Firepit, the flame sheets, the benches and the fire light;
  leave a comment pointing at your file), the `FireLight` block in `Tick`
  (delete it with the light), and the `FireLight` member. `M_FireFlame`,
  `M_FireSparks`, `M_Ember` and `Tools/create-fire-material.py` may be
  retired with their README mention.
- In `FlowFestCrowd.cpp` and `.h`: the fire-turn behaviour (the
  `SimMinute >= 1290` fire window code, `PerformerProps`, the performance
  slot logic, `PerformanceTurnSeconds`) and the per-person loop in `Tick`
  of `FlowFestWorld.cpp` for performers. Not the routes, needs, homes or
  the gate behaviour; the Crowd run takes those in wave 3.
- The three jugglers the Juggling run spawned: you may move them at night.
- Your folder, `Tools/author-jam.py`, `Tools/import-jam.py`, the `fire`
  landmark's use (keep the id; the review camera and the story use it; you
  may move its position to the amoeba centre and must say so).
- README: the fire paragraph.

You do not own: the sky, exposure, moon and string lights (Night run, same
wave; coordinate through `SetTimeOfDay` by adding exactly one call at its
end, `Jam->ApplyTimeOfDay(Hour)`, if you need the hour), the dip station
furniture and the archway (Structures; you dress them), tents, cars, the
day crowd.

## Build this, in this order

Commit and capture after each step. Steps 1 to 4 are the core.

### 1. The amoeba, the rope and the entrance

- Boundary: a closed curve from an ellipse 51 by 32 m at the interview
  centre, long axis east-west, deformed by two octaves of low-frequency
  hashed noise (plus or minus 3 m) so it is clearly not an ellipse, with a
  gentle bulge toward the stage side. Expose it as a pure function
  (`JamBoundary(t)` for t in 0 to 1) in your header and test that it is
  closed, non-self-intersecting, inside the Middle Earth clearing polygon
  and clear of the W1 to W4 canopies, the dip station and the archway.
- The LED rope: a spline mesh along the boundary (a 12 mm tube, authored
  or `/Engine/BasicShapes/Cylinder` segments every 1 m with `M_Jam_Rope`:
  emissive by night with the colour from Q4, a slow drift, a faint pulse at
  the entrance). By day it is a dull white rope on the grass. No point
  lights along it; the emissive and the rope's own glow decal (a thin
  translucent strip 40 cm wide under the rope, emissive, fading out) carry
  the look. An entrance gap of 4 m at (79.5, -133) with two short posts.
- Trodden grass: inside the amoeba the grass is worn; if the ecology
  exposes a trampling custom-data term, set it for clumps inside; if not,
  lay a flat decal mesh with a worn-grass material at low opacity and say
  so.
- Queue line: stanchions and rope from the walk-in along the north edge to
  the dip station and round to the entrance (the interview's switchback),
  on the grass outside the amoeba.

### 2. Safety stations and the dip station at night

- Stations every 5 to 6 m along the boundary, on the rope line, facing in:
  a camping chair (author one; seeded fabric colour), a dark duvetyne towel
  over its back or folded on the ground, and at every second or third
  station a small flame: a fuel can with a wick and a tiny Niagara flame
  (10 to 15 sprites) and no light. About 25 stations. A safety person in
  about half (standing beside the chair, since there is no sit clip; the
  Crowd run's instanced seated figures replace them in wave 3).
- The dip station: fuel cans open, the dip bucket with a glowing-wet rim,
  a spin-off barrel, wet towels, a bucket of water, one work light on a
  stand (non-shadow, cool white, 8 m radius), a rope line, two safety
  people standing.

### 3. The edge: chairs, wagons, blankets, couches, props

Behind the rope, in a band 1 to 8 m out, seeded and denser on the stage
side and the entrance side:

- Camp chairs in clusters of two to five, some facing the circle, some
  turned to each other; about 60.
- Wagons (a collapsible folding wagon: a fabric box on four wheels with a
  handle) with props sticking out: hoops, staffs, poi, fans; about 14.
- Blankets (2 by 1.5 m quads with a thin skirt) and yoga mats (0.6 by 1.8 m)
  on the grass, about 40, with props and water bottles on them.
- Inflatable couches (a lounger shape 2 m long, bright nylon), about 8.
- Coolers, a few small LED lanterns on the ground (emissive, no lights).
- Keep the entrance, the queue, the W canopies and the stage front clear.
  Write the exclusion as a pure function and test it.

### 4. The people inside

- Count by hour from Q1: ramp from 20:30 (a few with LED), peak at 22:30,
  thin after 01:00, empty by 03:00. Draw performers from the crowd's
  performer and practice roles and, if the count is short, from spare
  crowd members; the Crowd run adds numbers in wave 3.
- Motion: each performer inside follows a slow smooth path (two sine terms
  plus hashed drift, 0.2 to 0.5 m per second) within the amoeba, repelled
  from the rope and from each other at 2.5 m, pausing for 10 to 40 s at
  a time; while moving or paused they play their prop routine (the captured
  `A_Flow_*` clips through `PlayPerformance`). Facing: about a third face
  the nearest edge with people (playing to the audience), the rest free.
- Props and finish from Q2: assign the prop variant from the performer's
  seeded choice across poi, staff, hoop, fans, dragon staff, rope dart,
  and set `SetFinish(fire)` or `led` by the seeded split after civil dusk;
  the prop component's own effect lights are the only lights inside the
  circle. Cap simultaneous fire finishes at 18 for the frame budget;
  cycle who is lit every 2 to 4 minutes (a performer "dips" at the dip
  station: walk out through the entrance, 40 s at the station, walk back
  in, lit).
- Jugglers from Q6: two to four of the Juggling run's component instances
  inside with solo patterns at night, clubs unlit or LED (an emissive club
  material instance), and one passing pair outside the rope on the tent
  side.
- Spectators around the edge: the standing arc 1.5 to 6 m outside the
  rope, facing in, from the crowd's spectators; leave the seated look to
  the Crowd run.

### 5. The stage at night (if time allows)

Speakers on, a DJ figure at a table on the stage, four small coloured
lights on the roof beam (non-shadow, 6 m radius) if Q5 is a, and nothing
else lit.

## Review

Views and hours (BEFORE and AFTER, same order, back to back):

- `fire` 22.5 (the hero), `fire` 20.5 (dusk, rope just coming on), `fire`
  23.5, `fire` 17.5 (the rope and chairs by day; no people inside before
  20:30), `overview` 22.5, `camp` 22.5 (the glow seen from the camps).

The `fire` review camera sits at an offset from the `fire` landmark; if you
move the landmark to the amoeba centre, check the camera still frames the
circle from its north-west and does not stand inside the rope. Walk it:
`-Review fire -Explore` at 22.5; stand at a safety station, then inside.

## Done when

- At 22:30 the view shows a rope-lit amoeba with people spinning fire and
  LED inside, weaving, some facing out; safety chairs on the line; chairs,
  wagons, blankets and couches behind; the dip station lit; no bonfire.
- The rope is clearly irregular and reads as rope on grass, not a line.
- Nothing inside the circle but people and props; nothing placed on the
  queue, the entrance, the stage front or the workshop canopies; a test
  proves the boundary and exclusions.
- By day the rope and chairs are there and the circle is empty.
- Jugglers juggle inside at night.
- Saves load; the story's fire-jam phase still completes (the player can
  enter and perform).
- All existing tests pass; yours pass.
- Frame time at `fire` 22.5 no higher than the bonfire baseline (the
  shadowed light is gone; spend that on the rope and the prop fire) and
  `camp` 22.5 within +1.0 ms.

## Judgement calls to record

The boundary noise and seed; station count; how many lit at once and what
that costs; the motion model constants; which crowd members you drew;
whether you moved the landmark.
