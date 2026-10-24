# Wave 4, run K: Cars that belong to campers

Workstream `Cars`. Folder `/Game/FlowFest/Assets/Cars/`, prefix `M_Cars_`,
new source files `FlowFestCars.h`, `FlowFestCars.cpp`,
`FlowFestCarsTests.cpp`. Starts after wave 3 merges (it needs the Crowd
run's 175 cars and the Arrival run's queue).

## Why this run matters

A hundred and seventy-five cars from six bodies in four paints each, all
closed, clean and empty, read as a car park twice over. At a camping
festival the cars are the camps' closets: roof racks with hoops strapped
on, roof boxes, open hatches with gear spilling out, a bike on a rack, a
sun shade in the windscreen, dust on the lower panels, and on the top pad
rows of cars whose owners are down at the tents.

## You own

`BuildVehicles` for accessories and wear (not counts or positions; Crowd
placed them), the `ParkedCarModels` table for accessory slots per body, a
dust parameter through a material instance in your folder (do not re-save
the car materials), the Arrival run's queue and moving car (take them
over), the driven car's dust trail hook in `FlowFestCharacter.cpp` only,
your folder and files.

## Build this, in this order

1. Accessories per car, seeded: roof rack 40 percent, roof box 15, hoops on
   the rack 20 (three to six), bike on a rear rack 10, windscreen sun shade
   30, open hatch with a gear pile 20 (duffel, cooler, chair bag, crate),
   a tarp from the rack to the ground 10. One instanced mesh each, placed
   from the body's dimensions. Cars on the top pad and overflow get fewer
   open hatches (their owners are away) and more sun shades.
2. Wear: a dust and road-grime band on the lower panels and arches through
   the material instance reading custom data, stronger near the drives;
   mud on a few after the week's rain (the interview says rain is normal).
3. Arrivals and the loop rule: the Arrival run's queue and moving car
   become yours; add one car creeping counter-clockwise around the loop
   looking for a spot at 16:00 to 18:00 on a spline, with brake lights and
   a dust puff, and one leaving the top pad at 17:00. Gone before 15:00 and
   after 19:00.
4. The player's car gets the dust trail on the drives.

## Review

`camp` 20.0, `gate` 16.0 (the queue), `overview` 19.5, and the drive in
from the county road around the loop.

## Done when

Cars read as individual campers' cars; the top pad reads as a parked lot of
absent owners; nothing floats or clips; the moving cars keep to the drives
and the one-way rule; tests pass; frame time within +1.0 ms at `camp`.

## Judgement calls to record

Accessory rates; the spline routes; the dust material route.
