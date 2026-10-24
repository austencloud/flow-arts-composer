# Wave 3, run G: Four hundred people

Workstream `Crowd`. Folder `/Game/FlowFest/Assets/Crowd/`, prefix
`M_Crowd_`, new source files `FlowFestCrowdTiers.h`, `FlowFestCrowdTiers.cpp`,
`FlowFestCrowdTiersTests.cpp`. Starts after wave 2 merges. The tier
technology is ready to brief now; the camping distribution waits for
question 7 and its default is below.

## Answers from Austen (filled in before launch)

- Q7 camping split: DEFAULT loop-heavy: 45 percent car camping in the loop
  interior, 38 percent tents around the lower loop (inner band and across
  the road by the tree line) with cars at the top, 17 percent upper tree
  lines and clearing edges. About 165 camps and 175 cars (75 in the loop,
  100 on the top pad and the overflow field).
- Q1 jam crowd at 22:30: DEFAULT 20 to 30 inside, 60 to 90 around.

## Why this run matters

Thirty-eight people on a site of four hundred. The camps are a handful of
tents; the fire circle's edge is empty; the paths have nobody on them.
Four hundred animated characters do not fit the frame budget, so the crowd
becomes two tiers: full characters near the player and at the jam, cheap
posed figures everywhere else. The camps and cars grow to match, placed by
the interview's rules so Austen can correct the split with one answer.

## You own

- `FlowFestCrowd.h/.cpp` apart from the fire-turn behaviour the Jam run
  took (routes, needs, homes, roles, gate behaviour, snapshots, the agent
  count); `BuildPeople`; `BuildCamps` and `BuildVehicles` for counts and
  placement (the CampLife run, same wave, dresses whatever these arrays
  hold at `BeginPlay` and places nothing of its own in them); the `Camps`
  and `Vehicles` arrays and `ParkedCarModels` counts, not the car
  accessories (Cars run, wave 4).
- The Juggling run's three actors: fold them into the crowd as a role.
- Your folder, `Tools/author-crowd.py`, `Tools/import-crowd.py`.
- README: the paragraph about the 38 attendees.

You do not own: the fire field (Jam), the camp furniture (CampLife), the
check-in dressing (Arrival), structures, the sky.

## Build this, in this order

### 1. Camps and cars at 400

Place about 165 camps and 175 cars by the interview's rule (first come, two
cars per camp spot inside the loop, tents on the inner band and across the
road along the tree line, cars for those campers on the top pad, the rest
at the upper tree lines and clearing edges, overflow field last), hashed,
never on a road, drive, path, structure footprint, the fire field, the
walk-in, the queue or under a trunk. Keep the existing 61 camps and 44
cars where they are (saves and the player's camp depend on them) and add
around them. Write the placement rule as a pure function with the split as
parameters and test it against the exclusion zones. Keep instance groups,
not actors.

### 2. Two tiers of people

- Tier A: full avatars, cap about 70, assigned by priority: the jam's
  performers and nearest spectators, everyone within 40 m of the player,
  the story's named roles. Reassigned every few seconds by hashed
  hysteresis so people do not pop between tiers in view.
- Tier B: instanced posed figures for the rest, about 330: the 16 character
  meshes frozen in six poses (standing, standing arms folded, sitting on
  the ground, sitting in a chair, lying on a blanket, walking mid-stride)
  as static meshes baked from the avatar at import time (`import-crowd.py`
  poses the skeletal mesh by clip frame and saves a static mesh per
  character and pose). Clothing colour by custom data. Walking Tier B
  figures slide along routes at walking pace with a 2-frame stride
  swap; it reads at 40 m and is hidden within 25 m, where Tier A takes
  over. If the engine's AnimToTexture plugin enables and works in 5.8, it
  may replace the pose bake; say which.
- Seated figures go where the CampLife run's chairs and the Jam run's
  blankets and safety chairs are (read their placements at `BeginPlay`
  after they build; coordinate the call order in `BeginPlay`).

### 3. Where people are, by hour

Occupancy by hour, hashed per agent: Thursday 15:00 to 18:00 half the
people are at their camps, a quarter walking (arrivals, the loop, the
vendor path), a quarter at Middle Earth and the juggling tent; 18:00 to
20:30 dinner at camps and the food structure; 20:30 to 01:00 the jam
(numbers from Q1), the stage, the camps; after 01:00 camps; morning
mostly in tents. Keep Hash01 determinism and the snapshot format.

### 4. Jam circles everywhere (if time allows)

Small practice circles at camp hubs and the juggling tent by day (three to
five Tier A or B figures with unlit props), as the interview says.

## Review

`camp` 20.0 and 22.5, `gate` 16.0, `overview` 19.5 and 22.5, `fire` 22.5
(the edge crowd), and a walk from the check-in to the fire field at 17.0
watching for tier pops.

## Done when

The site reads as four hundred people from the overview; camps and cars
match the split; the jam has its edge crowd; no tier pop is visible on the
walk; no figure stands in a tent, on a road, or in the rope; frame time
within +1.0 ms at `camp` and `overview` and +1.5 ms at `fire` 22.5.

## Judgement calls to record

The placement rule and split; the tier cap and hysteresis; the pose bake
route; counts per hour.
