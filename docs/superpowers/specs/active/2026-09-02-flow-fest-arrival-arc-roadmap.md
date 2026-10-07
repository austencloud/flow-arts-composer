---
status: active
value: null
effort: null
work_state: in-progress
remaining: After the built Drive in, design and implement the next arrival-arc sub-project with its own gate; keep tree-pipeline dependencies explicit.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Flow Fest Arrival Arc — Roadmap

**Triage evidence (2026-10-07):** The roadmap records the Drive in as built, and `src/routes/test/flow-fest-sim/FlowFestDrivenCar.svelte` exists. Later arrival-arc deliveries remain separate sub-projects, so the roadmap is still open.

**Date:** 2026-09-02
**Status:** Decomposition agreed; Drive in built, later arrival-arc sub-projects remain open.
**Settled so far:** the whole sim becomes third person — on foot as well as in
the car; the game opens on the loadout screen and then puts you at the wheel;
the approach runs the official ODOT centerline re-clipped to the terrain square
— 886.9 m of measured road, 132 s at a careful 15 mph — fully player-steered.
The whole economy is designed up front; only the car reaches the screen in the
first delivery.
**Scope:** This is a roadmap, not an implementation spec. Each sub-project below
gets its own `YYYY-MM-DD-<topic>-design.md` and its own implementation plan.

## The arc, as Austen described it

Recorded verbatim in intent and order, 2026-09-02:

> When you first open up this game you should drive in — that's the whole thing.
> You arrive at the festival on the road after having driven in for a couple
> minutes through the cornfields. Then drive your car carefully and slowly into
> the front gate. You park it off to the side temporarily. You get out of your
> car. You go to the pop-up canopy which is set up, which has a picnic table and
> several people behind it. You get your wristband. You show your ID. You say hi
> to a couple friends. Then you get told where the parking situation is, and you
> go drive your car to wherever you set up camp. Then you take a while to
> actually unload your stuff and maybe set up, and make sure that you move the
> car back to its spot within two or three hours after pulling in — but nobody is
> really going to harp on you for that. Then after that your car's parked, your
> stuff is set up, you probably need like a meal or something, and you probably
> have a lot of friends you want to say hi to. Maybe check out the vendors at
> Vendor Village along the way. Maybe even just do a walk around the campground
> just to see what there is to explore. And while you're walking around the
> campground you're going to run into people you know from past years, and people
> who are spinning, and people who are already forming jam circles, people who are
> excited to be seeing each other again.

The load-bearing sentence is the first one. Arrival is the emotional core of a
festival, and it is currently the only part of the sim with no simulation in it.

## What the sim already has

| Capability | Owner |
| --- | --- |
| Registered road centerline (18 ODOT points, NAD83/UTM 16N) | `FLOW_FEST_CAMDEN_COLLEGE_CORNER_ROAD` in `src/routes/test/flow-fest-sim/flow-fest-camp-plan.ts` |
| Surveyed camp entrance `{328.26, -98.16}` (Aug 2024 Street View panorama, snapped 0.63 m to ODOT feature 3019609) | `FLOW_FEST_CAMP_ROAD_ENTRANCE`, same file |
| Gatehouse site, lower check-in point, campground loop, entrance basis with `driveInwardUnit` | `FLOW_FEST_LOWER_GATEHOUSE_SITE`, `FLOW_FEST_LOWER_CHECK_IN`, `FLOW_FEST_LOWER_CAMPGROUND_LOOP`, `FLOW_FEST_LOWER_ENTRANCE_BASIS` |
| "South cornfield" landmark and region | `flow-fest-camp-plan.ts` |
| 1 m DTM terrain, 1025×1025 samples, world bounds ±512 m | `static/data/flow-fest-sim/terrain.manifest.json` + `terrain-height.f32` |
| A complete ground-vehicle simulation — for the electric unicycle | `src/lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.ts` and `state/flow-fest-mobility-state.svelte.ts` |
| NPC population with a `gate-greeter` role and a `gate-greet` activity, plus display names, sociability, schedules, routable anchors | `src/lib/features/flow-fest-sim/domain/flow-fest-population.ts` |
| 11-phase progress state machine with objectives and snapshot validation | `src/lib/features/flow-fest-sim/state/flow-fest-progress.ts` |
| 44 parked cars, correctly grounded on their tyres | `src/routes/test/flow-fest-sim/flow-fest-parked-cars.ts` |
| Sim clock at 0.5 minutes per second | `FLOW_FEST_SIM_MINUTES_PER_SECOND` |
| Corridor graph, audio walla, fire jam, forest ecology | various, `src/routes/test/flow-fest-sim/` |

The EUC is the important one. It is the pattern a drivable car follows: input
merge, dynamics step, terrain attitude derivation, collision reconciliation,
mount and dismount, battery, odometer, parked collider, snapshot and restore.

## What the sim does not have

- **Driving of any kind.** The two phases that would carry it are staged
  buttons. `camp-arrival` reads *"Vehicle travel is staged without inventing a
  drive time"*; `vehicle-settle` reads *"The registered road centerline ends in
  west upper parking. Travel is untimed"*. The action labels are literally
  "Stage arrival" and "Stage west parking".
- **Getting in or out of a vehicle.**
- **Any interaction or conversation system.** The nearest thing is
  `observeFlowFestFireJam`, a proximity observer hardcoded to the fire's
  coordinates with a fixed join radius.
- The canopy, the picnic table, the crew behind it, the wristband, the ID.
- Cargo, unloading, the soft two-to-three-hour move-the-car window.
- Meals.
- **Vendor Village. It does not exist anywhere in the code or the camp plan.**
- Free-form campground wandering. Today the equivalent phase is a directed walk
  to Middle Earth.
- Anyone you know from past years.
- Daytime jam circles that form on their own.

## The approach drive is already surveyed — re-clip, do not extrapolate

`FLOW_FEST_CAMDEN_COLLEGE_CORNER_ROAD` holds 18 points running x −170 → 370,
about 540 m. That is not the extent of the source data. The centerline was
clipped to `FLOW_FEST_CAMP_PLAN_BOUNDS` (`minX: -170`), not to the terrain
square, and the doc comment saying "clipped to the registered terrain frame" is
inaccurate about which bounds were used.

Re-queried from the recorded source on 2026-09-02 — ODOT TIMS Road Inventory
FeatureServer 0, `OBJECTID=3019609`, `outSR=26916`, converted with the terrain
manifest's own transform (`worldX = easting − 690142`, `worldZ = 4384552 −
northing`):

- The official feature carries **81 points** spanning worldX −2245 → 445.
- **30 of them fall inside the terrain square**, giving 961.6 m of centerline.
- The road crosses the square's west edge at **(−512.0, 38.0)** and reaches the
  registered camp entrance after **886.9 m**.
- It continues a further 189 m past the gate to the square's east edge, so the
  drive does not end at a dead end and an overshoot is recoverable.
- **The registered entrance projects onto the official centerline at 0.00 m
  offset**, independently confirming the Street View survey.

Approach times over that 886.9 m: **165 s at 12 mph**, **132 s at 15 mph**,
**99 s at 20 mph**, **79 s at 25 mph**.

So "a couple of minutes through the cornfields" is reachable at a careful rural
speed on **entirely measured geometry**. No bearing extrapolation, no authored
road, and no terrain outside the survey. The work is to re-clip the source to
the terrain square rather than the camp-plan bounds.

## It really is corn — in odd years

Austen: *"you'll find that the corn situation is kind of what we have going on
in reality."* Confirmed against the **USDA Cropland Data Layer**, the annual
30 m national crop classification (public domain; NASS CropScape
`GetCDLValue`, queried 2026-09-02). Google's imagery is licensed against
derivative works, so it stays a human reference — as it already was for the
entrance panorama — and the crop layer is the better source anyway, because it
names the crop instead of leaving it to be eyeballed.

Sampled along the 886.9 m approach, reprojected EPSG:26916 → EPSG:5070:

| Year | Field south of the road |
| --- | --- |
| 2021 | Corn |
| 2022 | Soybeans |
| 2023 | Corn |
| 2024 | Soybeans |
| 2025 | Corn |

A textbook two-year corn/soy rotation. **Odd years are corn.** The 2023 NAIP
orthophoto already in the source lock is a corn year, so the cached imagery and
the corn reading agree.

The corridor has real structure, and it is measured rather than authored:

- **0 → 540 m: open corn on the right.** Unbroken south of the road, from the
  square's west edge, extending past 240 m deep and giving way to alfalfa around
  320 m. At 45 m off the centreline every 40 m station reads Corn.
- **The left is not corn.** North of the road: the road corridor itself out to
  ~40 m, deciduous forest 60–100 m, then alfalfa and hay beyond 160 m.
- **540 → 887 m: deciduous forest, both sides.** The fields end and the woods
  close in for the last ~350 m. **The gate is in the trees, not in the corn.**

At a careful 15 mph that is roughly **80 s of open corn, then 50 s of woods,
then the gate** — an approach that already narrows on its own. Verified twice:
station sweep every 40 m, and lateral sweeps at 10–320 m on both sides.

Recording this in the source lock alongside ODOT, NAIP, and 3DEP belongs to the
sub-project 1 implementation, not to this roadmap.

### On May 14 the corn is not standing

Austen set the festival on **May 14** (chosen 2026-09-02, with "no corn
necessarily" — the bare fields are accepted, not worked around). That is a fact
about the fields, not just the light. Ohio corn is roughly a quarter to a third
planted in that week (NASS crop progress: 25% by 2025-05-12, 36% by 2024-05-12,
33% by 2026-05-03), and what is planted went in days earlier, so nothing has
grown.

The cached NAIP orthophoto settles it directly. It was flown **2023-05-22** —
two weeks *after* the target date, in a **corn year** — and the field south of
the road is bare tilled soil with visible tillage lines. Measured from the
4-band raster over 50×50 px patches:

| Sample | NDVI | Reading |
| --- | --- | --- |
| South field, station 240 | **+0.044** | bare soil |
| South field, station 440 | **+0.047** | bare soil |
| North hay, station 240 | +0.411 | actively growing |
| Woods, station 750 | +0.356 | fully leafed out |

So on May 14: **cornfields with no corn in them.** The name of the place is
right and the wall of green is a late-summer memory. The deciduous woods at the
gate, by contrast, are fully leafed out — Ohio leaf-out is mid-to-late April.

Sun at the gate on May 14 (NOAA, 39.59005 N / 84.78218 W, EDT): sunrise 06:26,
solar noon 13:35, **sunset 20:44**, civil dusk 21:15, 14.31 h of daylight. The
road runs east, so **from 15:05 until dark the sun is behind the driver** — low
warm light on the fields and woods ahead, and no glare at any point on the
approach.

### The terrain already writes the arrival

Elevation sampled from the registered 1 m DTM along the 886.9 m approach, with
bare-earth line-of-sight to the entrance:

- **0 → 640 m: a flat plateau at 296–298 m.** Grades under 1.5%, heading pinned
  at 87° — dead straight east. Open, exposed, long views over bare field.
- **640 → 800 m: the ground falls away.** The grade steepens to **−9.5%** as the
  road drops off the plateau edge into the valley.
- **800 → 887 m: a 60° left-hand bend** — heading swings 81° → 63° → 40° → 27° —
  still descending, with woods on both sides.
- **Net −20.95 m from the west edge to the gate.**
- **The entrance is invisible until station 800.** From 0, 200, 400, 600 and
  700 m the bare earth alone blocks the sightline, before any tree canopy is
  added. It comes into view **86 m out**, about four seconds at 15 mph.

Exposure, then descent, then a blind bend, then the gate. None of that is
authored — it falls out of the ODOT centerline and the DTM. It also vindicates
Austen's "drive carefully and slowly into the front gate": a 9.5% downgrade into
a blind 60° left-hander is exactly where a driver lifts off.

The DTM is bare earth, so the built road surface may sit slightly above or below
these samples where it was cut or filled. Treat the profile as the landform, and
take the driving surface from the road geometry.

## Open: the trees are the content of this drive, and the tree pipeline is EOL

With the fields bare, the woods are the only three-dimensional thing on the
approach — the treeline you see across the field for 640 m, then 350 m inside
it, then the gate. So the tree pipeline is load-bearing for this sub-project.

Austen asked on 2026-09-02 why the project uses PlantFactory rather than
[ez-tree](https://github.com/dgreenheck/ez-tree). Investigated the same day.

**What we actually use.** `scripts/forest-plantcatalog-bridge.json` drives
`PlantFactory.exe` **4.8.0.0** from `C:/Program Files/e-on software/...` against
the local `PlantCatalog`. `flow-fest-forest-ecology.ts` loads 19 candidate GLBs
from `/models/forest/trees/candidates/plantcatalog-r1/`.

**Four problems, in increasing order of severity:**

1. **The tool is end-of-life.** Bentley Systems ceased sales and development of
   Vue, PlantFactory and PlantCatalog in May 2024, releasing them free for
   commercial use with support limited to critical security fixes. Version
   4.8.0.0 is where it stops.
2. **It builds on exactly one machine.** A Windows GUI application at a
   hardcoded absolute path. No CI, no second machine, no agent can regenerate
   the forest.
3. **The assets cannot be redistributed.** The bridge records
   `standaloneAssetRedistributionAllowed: false`.
4. **The species are the wrong continent.** The loaded candidates are *Quercus
   robur* (English oak), *Salix alba* (white willow), *Salix babylonica*
   (weeping willow), and *Aesculus carnea* (a European hybrid). The reference
   forest for this county is **beech–maple**: Hueston Woods, in Preble County,
   is a National Natural Landmark old-growth beech–maple remnant. Everything
   else in this sim is surveyed to the metre and the woods are European.

**ez-tree, verified rather than assumed** (v1.1.0, published 2026-01-15, **MIT**,
zero dependencies, one peer dependency on `three` which the project already
has):

- **It generates headless in Node.** It touches `document` at import, but a
  ~15-line DOM shim (`document`, `Image`, `FileReader`) is enough. No WebGL
  context required. Verified by generating and exporting six presets.
- **Its output already matches our conditioning contract.** Every tree is two
  meshes with named materials — `branches` (opaque) and `leaves`
  (`alphaTest` 0.5, 0.3 for pine). That is precisely the opaque-wood versus
  cutout-card split `build_flow_fest_tree_lods.mjs` is written around, and
  `alpha-coverage-mipmaps.ts` already owns coverage-preserving mips for exactly
  this kind of alpha-tested foliage.
- **Textureless GLB export works**, which is the same contract the distance
  tiers already ship: geometry, UVs, original material names, materials
  re-bound at runtime by name.

| Preset | Meshes | Verts | Tris | GLB |
| --- | --- | --- | --- | --- |
| Oak Large | 2 | 30,104 | 22,566 | 1075 KB |
| Ash Medium | 2 | 28,399 | 20,000 | 1007 KB |
| Pine Large | 2 | 22,217 | 19,392 | 810 KB |
| Bush 1 | 2 | 16,315 | 13,872 | 594 KB |
| Oak Small | 2 | 9,544 | 6,806 | 341 KB |
| Aspen Medium | 2 | 7,600 | 7,200 | 282 KB |

**Two honest costs.** Its units are not metres — Oak Large exports 102 units
tall against a real oak's 20–25 m, so scale needs calibrating. And its presets
are Ash, Aspen, Oak, Pine, Bush and Trellis: **it does not hand you beech or
sugar maple either.** Neither tool ships the Ohio canopy. The difference is that
ez-tree is parametric and scriptable, so the canopy can be authored toward
*Fagus grandifolia* and *Acer saccharum*; PlantCatalog is a fixed European
library.

**Not yet judged: visual quality.** The plumbing, licence, and species facts
above are measured. Whether an ez-tree beech at 15 m reads as well as a
PlantFactory oak is a side-by-side render that has not been done, and it is the
thing that actually decides this. Do that before committing.

This is its own decision with its own spec, not part of the arrival arc. The arc
consumes it.

## The whole sim goes third person — ADDED 2026-09-02

Austen: *"The whole SIM is not first person in fact. It should be third person
the whole time. I know, big direction change."*

It reaches further than the car. The sim is first person on foot today —
`FlowFestGrayboxWalkScene.svelte` sets `EYE_HEIGHT = 1.7`, tags its camera
`established-first-person-walk`, and the walking player has no rendered body at
all. Checked the same day, the change is smaller than it sounds, because both
halves already exist in this scene:

- **Third person is already a mode, already used here.** The scene passes
  `allowedModes={[CameraMode.THIRD_PERSON]}` the moment you mount the electric
  unicycle, and `[CameraMode.FIRST_PERSON]` when you are on foot, with
  `disableModeToggle`. The mounted rider renders a real body — `Avatar3D` with
  `FLOW_FEST_EUC_CONFIG.riderAvatarId` (`ch01`). So the sim has *already* shown
  you your own character from behind; it just stops when you step off.
- **The walking character owner is already mounted in the same scene.**
  `FlowFestFestivalCommunity.svelte` renders every spectator as `Avatar3D` with
  `enableLocomotion` and `enableFootPlanting`, driven by position, facing angle,
  `isMoving`, `moveSpeed` and `moveDirection`. The player becomes one more of
  those, with the camera behind it. That is the shared locomotion owner, not a
  second walking system.

So the work is: give the on-foot player the body the NPCs already have, allow
third person on foot, and move the camera from eye height to a follow rig. Three
things this must not do:

1. **Do not loosen the drift guard.** `flow-fest-runtime-contract.ts` asserts
   `spawn.eyeHeightMeters === 1.7` and errors with *"Flow Fest Gate 2 spawn,
   camera, zone, or anchor set drifted"*. That guard exists to catch exactly this
   kind of silent change. Give it the new intended value; never relax the check.
2. **Do not hand-roll a follow camera.** `shared/3d/camera/` owns camera
   movement and transitions.
3. **Third person changes what the player can see of themselves, so it changes
   what has to be right.** Character, clothing, the props on your back, and how
   the body sits in the car all become visible surfaces that first person hid.

This is a prerequisite for sub-project 1 — the drive is authored around a camera
behind the car — and it re-opens the on-foot camera for every later sub-project.

## Decomposition

Six independent subsystems, in dependency order. Each gets its own spec, plan,
and implementation cycle.

### 0. Loadout and economy — ADDED 2026-09-02

Austen, when asked whether the player picks their car:

> If the very first thing in your game is picking your car, well why aren't you
> going to pick the one prop that you come in with, and the tent that you pick it
> in with? Why not have a finite set of money that allows you to pick your
> favourite things? For example if you get a bigger and better tent then you're
> going to sleep more, because we're eventually going to have an energy bar which
> is going to keep track of how much you've been moving around and how much you
> need to go rest. Also you could pick whether you want to eat from the vendors
> which costs more money, or if you want to prepare food ahead of time which
> actually saves you money — but I don't know how that game mechanic would make
> sense, because obviously everyone would just prepare ahead of time.

A finite budget spent before the drive, on the things you arrive with: car,
prop, tent, food strategy. The tent feeds a future energy and rest system. The
car caps cargo.

**The prepare-versus-buy balance.** Prepared food is cheaper in money and more
expensive in everything else, so neither play dominates:

- **Time and distance.** Eating from your cooler means walking back to camp,
  cooking, and cleaning up — time away from the festival, and the walk spends
  the same energy the tent exists to protect. Vendor food is where you already
  are.
- **Cargo.** A cooler takes room in the car and time to unload; room not spent
  on a bigger tent. The car you picked caps both.
- **Decay.** Ice melts. Day 3 cooler food restores less than day 1. Vendor food
  does not degrade.
- **Where the people are.** Vendor Village is where you run into people you
  know. Eating alone at camp is the cheapest meal and the one where nothing
  happens to you.

A pickup with a big cooler and a cheap tent is a coherent build; so is a
hatchback with a great tent and a vendor budget. Every one of those costs is
something the sim needs for other reasons, so none of it is a balance tax
invented to prop up the mechanic.

**Props are plural, and they are real geometry in the back of the car.** Austen,
2026-09-02:

> Honestly you'll have a bunch of props most likely if you're a seasoned Flow
> Fest veteran. So maybe you can pick a wide variety and they can all be real 3D
> models and they can literally be sitting there in the back of your car, kind
> of stacked or next to each other. [...] As we add more 3D prop models to the
> system, get more and more realistic.

That overturns the earlier "the one prop that you come in with". It also does
real work for the sim: props visible in the cargo area are the cheapest possible
proof that the loadout screen is not a menu that lies, and they are the reason a
bigger car matters before the tent or the cooler exist.

`scene-prop-catalog.ts` holds **15** props with 3D models today — Sword,
Sickles, Staff, LED Baton, Fire Staff, Chicken, Big Chicken, Club, Torch,
Guitar, Ukulele, Triquetra, Triquetra 2, Triad, Trigeng. So a fixed "pick 33" is
not currently expressible. **The cap is the car, not a number.** Cargo volume
comes from the vehicle you chose, each prop has a footprint, and you pack until
it is full — which makes the pickup-versus-hatchback choice legible on the
loadout screen on day one and grows on its own as the catalog grows. The catalog
is the single owner of what exists; the loadout screen reads it rather than
keeping its own list.

**The money is the ticket first, then the weekend** (Austen, 2026-09-02). You
start with what you saved, the ticket comes out before anything else, and what
is left buys the car, the props, the tent and the food strategy. That is what
makes a cheap car a real option rather than a punishment, and it puts the stakes
on screen before the first turn of the wheel.

**The energy bar starts on the drive** (Austen, 2026-09-02), not at camp
arrival. So the departure dial has teeth immediately: leaving at six in the
morning means arriving with less in the tank. It also means energy is a
slice-1 system, not a sub-project 3 system — the loadout screen's dial and the
bar it feeds both have to exist for the drive to mean anything.

**Veteran or first-timer is a loadout choice too.** It gates who recognizes you
at the gate and what you already own. Its downstream systems are in
sub-project 5.

**The discipline that keeps this honest:** a choice may only appear on the
loadout screen once at least one of its consequences is implemented. Otherwise
it is a menu that lies. The budget and the car qualify immediately; the tent
qualifies when it becomes cargo you carry and pitch; food qualifies when Vendor
Village and the energy bar exist. The data model is designed once, in full, and
the screen reveals choices as their consequences land.

Depends on nothing. Its consequences land across sub-projects 1, 3, 4, and 5.

### 1. Drive in — BUILT 2026-09-04

Car simulation on the EUC pattern; the ODOT centerline re-clipped to the terrain
square; careful, slow entry at the front gate; temporary parking off to the side;
getting out of the car.

Settled with Austen on 2026-09-02:

- **Driving model: grounded but forgiving.** Throttle, brake, speed-sensitive
  steering on the EUC pattern, plus weight transfer, mild understeer, and a
  loose gravel shoulder. Automatic; it cannot stall. The pickup must feel
  heavier than the hatchback so the loadout car choice is felt, not stated.
- **Camera: third person, behind the car** — and third person on foot too, for
  the whole sim. See the section above; it is a prerequisite, not a detail of
  this slice.
- **Date: May 14.** Bare fields, fully leafed woods, sun behind the driver from
  15:05 to sunset at 20:44.
- **Departure time is a dial on the loadout screen.** Early, midday or late
  afternoon. It sets the arrival light, whether there is a queue at the gate,
  and how much daylight is left to make camp. This is the only piece of the
  economy that must exist for slice 1.
- **You pick your character from the deployed roster.** The scene package ships
  17 (`CHARACTER_DEFINITIONS` — Marcus, Jade, Viktor, Luna, Nora, Felix, Maya,
  Leo, Suki, Blake, Sage, Quinn, Character 26, Remy, X-Bot, Y-Bot, Austen), the
  same catalog the NPCs draw from, so the player is visibly one of the crowd.
- **The energy bar is live on the drive**, so the departure dial costs something
  from the first minute.
- **The loadout screen comes first, then the road.** Not a cold open on the
  highway. You pack, you pick, then the first thing you see in the world is the
  road — so the drive is the first *place*, and the choices you made are already
  sitting in the car with you.
- **The surveyed 887 m is the whole drive.** The game opens at the west edge of
  the terrain square with the player's hands already on the wheel.
- **No music, no radio, no dialogue.** Road noise and the engine. Austen chose
  this over a soundtrack or a car radio.
- **Overshoot the gate and you turn around and come back.** No rubber-banding,
  no invisible wall. The centerline runs 189 m past the entrance to the square's
  east edge, so there is real road to turn around on.
- **The slice ends parked at the gate, out of the car.** The canopy exists as
  geometry you can walk up to; nobody is behind it until sub-project 2.
- **Traffic: the road is essentially yours.** A few cars that may or may not be
  going to the festival. There may be someone ahead of you in line at the gate,
  or you may be first — it depends on when you left.

Prerequisite for sub-project 3. Self-contained and independently verifiable.
Austen: *"that's the whole thing."*

### 2. The canopy

A general proximity-interaction owner, generalizing `observeFlowFestFireJam`
rather than adding a second parallel proximity system. The canopy, picnic table,
and crew as a real site. Wristband and ID as an exchange with people instead of
a button. Being told where the parking situation is, through a person.

Foundation for sub-projects 4 and 5 as well.

### 3. Camp arrival

Drive to the site you chose. Unload cargo over real time. The soft
two-to-three-hour window to move the car back, measured against the sim clock,
enforced socially rather than punitively — nobody harps on it.

Depends on 1 (a drivable car) and 2 (being told where to go).

### 4. The campground as a place

Vendor Village as new site content. Meals. Free roam replacing today's directed
walk to Middle Earth.

Depends on 2 for anything interactive.

### 5. People you know — and the systems behind them

Austen, 2026-09-02, when asked whether the game covers one festival or many:

> I think you either need to pick if you're a Flow Fest veteran or a first
> timer, because we can have a social dynamic where we keep track of all the
> people you've met and your relationship with them if we build this out enough.
> You might gain some notoriety and we have a notoriety tracker — there's
> several, you could gain notoriety for always going to classes or for always
> volunteering. Shit, we don't even have a volunteer system, we should add a
> whole way you can volunteer to work at gate or to work as a safety. The fire
> circle needs a whole redesign. So a lot of these things still need to be
> talked about.

That is four systems, three of which have no code at all. **None of them is
settled** — recorded here so the context is not lost, not because they are
designed.

- **Veteran or first-timer is a loadout choice**, not a fixed frame for the
  game. It sets who knows you at the gate, what you already own, and whether the
  arc is returning or discovering.
- **A relationship tracker** — every person you have met, and your standing with
  them. This is what makes sub-project 5 earn its ending instead of asserting it.
- **A notoriety tracker, and there is more than one axis.** Named so far: always
  going to classes; always volunteering. Notoriety is a different quantity from
  friendship — it is what people who have *not* met you have heard.
- **A volunteer system.** Working a gate shift, working as safety. Nothing like
  this exists. It is also the most interesting possible answer to "what do you
  do at a festival all weekend", because it is the one that puts you on the
  other side of the canopy in sub-project 2.
- **The fire circle needs a whole redesign.** Today it is
  `flow-fest-living-fire-jam.ts` plus `observeFlowFestFireJam`, a proximity
  observer hardcoded to the fire's coordinates with a fixed join radius, and a
  population whose roles already include `fire-dancer`, `fire-rotation`,
  `join-fire` and `watch-fire`. Scope of the redesign is undiscussed.

The original sub-project 5 content — returning acquaintances with memory of past
years, greetings, jam circles that form on their own during the day rather than
only at the scheduled fire jam — sits on top of these.

Depends on 2, and reads best after 4 exists to wander through. This sub-project
is now large enough that it will decompose again when it is reached.

## The fire circle, as Austen described it — ADDED 2026-09-02

Asked what was wrong with the fire circle, Austen answered that it *"just looks
completely wrong"* and then described what one actually is. This is the only
first-hand account of this site in the project. Recorded close to verbatim,
because almost none of it is inferable and several details contradict what is
built.

**Getting there.** The road runs straight through Middle Earth. At the top of
the hill, just past the boundary between Middle Earth and the lower campground,
the road veers uphill — steeply — up to a road and a series of houses. **You do
not go straight through.** You veer left at the top of that hill and it opens
onto a big grass field. *"We're going to have to figure that out"* — whether the
left turn and the uphill-to-houses are the same veer or two different ones is
ambiguous in the description and is a thing to resolve on the map, not by
guessing.

**The field.** Plain grass, and **most of the field is the fire circle.**

**The circle itself** is demarcated by an **LED rope lying on the ground** —
placed so nobody steps on it. **Safeties** sit at designated spots *just inside*
the perimeter, and they sit facing out; sitting there is how they signal they are
watching.

**Getting in is a route, not a radius.** This is the part the current proximity
observer cannot express:

1. A line that sometimes runs around the edge of the field, leading to
2. the **dip station** — sometimes with a queue immediately before it,
3. then another queue leading around to
4. **the archway** — a big arch that is *the* official entrance, the one point
   where you are supposed to enter to spin,
5. then you are in, and you spin,
6. and you leave by one of **several designated exit points** around the
   perimeter.

**Outside the perimeter is where most people are.** Wagons full of props.
Folding chairs. People's own electric unicycles. Standing, sitting, sitting
cross-legged. Laid-out blankets. Inflatable couches. Everyone talking and
interacting. Possibly a canopy at the edge where someone is storing props.

**The stage.** On the left side of the field, near the fire circle but offset
from it, and *"it's not immediately apparent that's where the showcase is going
to happen."*

**The showcase is a whole feature nobody has raised yet.** Austen: *"The
showcase is a big part of a Flow Fest and is usually a Friday night or Saturday
night or both kind of thing and surely should be part of the game."* Undesigned.

**Other named sites for this field:** first aid tent, volunteer HQ, the stage,
the fuel station. Volunteer HQ ties directly to the volunteer system in
sub-project 5, and first aid and fuel/dip tie to the safety role.

## Three corrections to what is already built

Separate from the fire circle, and separate from the arrival arc:

1. **The Middle Earth canopy is roughly a tenth of the size it should be.** What
   is built is one canopy with makeshift lights inside. It should be *"like a
   square circus tent — a massive canopy where lots of people can fit."* Austen
   owes the actual placement.
2. **Delete the hand-rolled LED sculpture in the Causeway.** Austen's words:
   *"that hand rolled crappy LED sculpture that we put in Causeway"* — it is not
   useful. Removing it, rather than improving it, is the instruction.
3. **The performers belong inside the canopy**, not wherever they are now.

And a domain constraint that applies to every performer in the sim: **if a
performer is spinning poi, the move has to be poi-legal.** See
`project_poi_legality` in memory — Poi Lab is planned rather than built, and
poi is a restricted subset of TKA rather than an equal sibling of the static
props (`.claude/rules/tka-domain.md`).

## The map pass, and the tool for it — ADDED 2026-09-02

Austen asked for another strict pass over the road maps, and offered the thing
that actually unblocks it:

> You want to instrument me up a page I can place the approximate location of
> these items in, like a bird's eye view, and even give you information on which
> way they face. Then I can create things such as first aid tent, volunteer HQ,
> the stage, the fuel station. [...] If we could systematize that whole process
> the sky's the limit in terms of what we could build as a representation of
> reality.

**Most of the machinery exists.** `/test/flow-fest-path-tracer` is a 2407-line
workspace with three modes (`layout`, `paths`, `plan`), three interactions
(`draw`, `place`, `pan`), an aerial background with `worldPointToImage` /
`imagePointToWorld` transforms, localStorage drafts, validation, and a
`save-plan` server endpoint that writes corrections back to disk.

Two things it lacks for this job:

- **Facing.** Every feature is a point or a polyline. Austen explicitly needs to
  say which way a thing faces — the stage, the archway, each safety position,
  each exit.
- **The vocabulary.** Its editable features are `lower-road-loop`,
  `tent-perimeter-band`, `car-camping-area`, `lower-loop-entrance` — a fixed
  four-field schema in `flow-fest-lower-layout.ts` with no facing and no
  repeated instances. Nothing for the field, the circle, the LED rope, the
  archway, the dip station, the queues, the exits, the stage, first aid,
  volunteer HQ, or the big canopy.

**Correction, same day: a sibling route, not a fourth mode.** This section first
said the answer was to extend the tracer. Reading it settled the opposite. That
page carries roughly forty branches shaped
`workspaceMode === "layout" ? A : workspaceMode === "plan" ? B : C`; a fourth
mode falls through to the paths branch in most of them, and the wreckage lands
on Austen's already-authored trace and layout data. The `never-hand-roll`
question is who owns a *capability*, not which file it lives in — so
`/test/flow-fest-site-markers` reuses `flow-fest-trace.ts` for registration
instead of re-deriving it, and copies the `save-plan` endpoint shape. It creates
exactly one new owner: `flow-fest-site-markers.ts`, for **oriented, repeatable
markers**.

Four shapes, one gesture — press where the thing is, drag to say the rest:

| Shape | What the drag means | Used by |
| --- | --- | --- |
| `point` | nothing; the drag is ignored | fuel station, houses |
| `facing` | which way it faces | stage, archway, first aid, volunteer HQ, safety posts, exits |
| `circle` | the radius | the grass clearing, the LED rope, the big canopy |
| `run` | where the line ends | the queue to the dip station, the uphill veer |

Facing is a compass bearing, 0 = north, clockwise through east, because that is
the vocabulary a person describing a site actually uses. Records resolve to
world metres in the same frame as the road traces, so an agent reads placement
without touching the picture. Saving writes
`docs/superpowers/specs/flow-fest-sim/austen-site-markers.json`.

Austen also raised walking Google Earth's street-level view to read building
placement. Google's imagery stays a human reference — it is licensed against
derivative works, so it informs where Austen puts a marker and never becomes a
build source. What he places is authored data he is the authority for, which is
a different and legitimate thing from tracing their imagery.

## Rules that bind this work

- `.claude/rules/never-hand-roll.md` — the EUC is the existing ground-vehicle
  owner and `observeFlowFestFireJam` is the existing proximity observer. Extend
  or generalize; do not stand up parallel implementations.
- `.claude/rules/no-fabrication.md` — the site geometry is surveyed. Do not
  invent distances, alignments, or site features that the registered data does
  not support. Say when something is authored rather than measured.
- `.claude/rules/visual-verification-mandatory.md` — every visual change here is
  a size, position, or structure change.
- `.claude/rules/worktree-workflow.md` — one worktree per sub-project.

## Related

- `docs/superpowers/specs/active/2026-08-24-flow-fest-sim-design.md` — the
  foundation spec. Its first vertical slice already listed "drive directly to
  the selected site" and the return drive through the lower gate; both shipped
  as staged buttons instead.
- Memory: `project_flow_fest_arrival_arc`, `project_flow_fest_car_replacement`,
  `reference_flow_fest_meshy_cars`.
