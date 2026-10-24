# Wave 3, run I: The arrival

Workstream `Arrival`. Folder `/Game/FlowFest/Assets/Arrival/`, prefix
`M_Arrival_`, new source files `FlowFestArrival.h`, `FlowFestArrival.cpp`,
`FlowFestArrivalTests.cpp`. Starts after wave 2 merges. Question 8's answer
corrects the Structures defaults here as well.

## Why this run matters

The player's first minutes are the county road, the entrance drive, the
loop junction and the check-in. After wave 1 the year-round building and
the check-in canopy stand where they should. What is missing is the
arriving: a sign at the road, cars queued at the canopy, volunteers with
wristbands, the one-way counter-clockwise rule made visible around the
loop, painted boards at every junction, the walk-in and the decorated
path feeling like the way in.

## You own

- In `FlowFestWorld.cpp`: the signs the Structures run placed (its `AddSign`
  replacement) to extend; nothing else there.
- In `FlowFestCharacter.cpp`: the check-in interaction's text and the
  wristband beat of the story's gate phase only (not the state machine's
  hours or other phases).
- Three waiting cars at the check-in and one moving car on the entrance
  drive between 16:00 and 18:00, through your own instance group of the
  existing car bodies (not `BuildVehicles`; the Cars run owns that in
  wave 4 and takes these over).
- Your folder, `Tools/author-arrival.py`, `Tools/import-arrival.py`.
- README: the arrival paragraph.

You do not own: the check-in canopy and the year-round building
(Structures; you dress around them), the crowd (ask for two volunteers at
the canopy through the Crowd run's role table if it has merged; otherwise
place two of your own standing figures), the fire field, camps.

## Build this, in this order

1. The road entrance: a hand-painted sign on two posts where the entrance
   drive leaves the county road (the festival name, an arrow), two feather
   flags, a cone. Nothing grand; it is a farm driveway.
2. The queue at the check-in: three cars nose to tail on the entrance
   drive short of the canopy at 16:00 to 18:00 (brake lights on the first),
   one car creeping along the drive from the road on a spline at 15 km/h
   with a small dust puff on the gravel (Niagara, tiny), two volunteers at
   the table with a clipboard and a wristband pile, a sandwich board with
   the day's schedule (painted, a few lines of fake-free text: "Thursday:
   check in, camp, fire jam at dark").
3. The loop rule: painted boards on stakes at the junction and at each
   corner of the loop with an arrow and ONE WAY, all pointing
   counter-clockwise; a CAMPING arrow at the inner band; a FIRE FIELD and
   VENDORS arrow where the Vendor Village road leaves the loop; a WALK-IN
   board at the clearing gap; toilet boards at each cluster.
4. The story: the check-in interaction says what the volunteer says
   (wristband, one-way loop, camp anywhere that is free, fire jam after
   dark at Middle Earth), and the player's wrist gets a wristband mesh (a
   small bright band on the avatar's wrist bone through the avatar's
   existing attachment path, if one exists; else skip and say so).
5. The decorated path by day: pennants and a few more hung panels where the
   Structures run left gaps; a WELCOME banner across the path where it
   enters Middle Earth.

## Review

`gate` 16.0 and 7.0, `overview` 19.5, and `-Review gate -Explore` driving
in from the county road, checking in, and walking the loop and the vendor
path to the fire field.

## Done when

The arrival reads as arriving from the road, the canopy and the loop;
every sign is an object, painted, slightly crooked; the queue and the
moving car are there at 16:00 and gone by 19:00; the check-in trigger and
drives stay clear (tested); tests pass; frame time within +1.0 ms at
`gate`.

## Judgement calls to record

Sign wording; the spline for the moving car; where the volunteers came
from; anything skipped.
