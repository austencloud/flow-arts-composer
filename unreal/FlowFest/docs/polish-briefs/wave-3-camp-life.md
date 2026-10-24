# Wave 3, run H: Camp life

Workstream `CampLife`. Folder `/Game/FlowFest/Assets/CampLife/`, prefix
`M_CampLife_`, new source files `FlowFestCampLife.h`, `FlowFestCampLife.cpp`,
`FlowFestCampLifeTests.cpp`. Starts after wave 2 merges; runs beside the
Crowd run, which owns the camp and car counts. No answer needed.

## Why this run matters

The camps read as a parking lot: cars in rows on grass, tents dropped
singly, canopies with one table. A flow-arts camp in May is dense and
lived-in: two to four tents around a shade canopy, chairs in a ring, a
cooler and a table, a rug with hoops and poi on it, a tapestry strung
between poles, a hammock between two trees, prayer flags, a clothesline,
hoodies on chair backs because the night is cold.

## You own

- `FlowFestCampLife.*`, called once from `BeginPlay` after `BuildVehicles`
  and the Crowd run's placement; it reads `Camps`, `Vehicles`, `Trees`,
  `Roads` and the structure footprints and places nothing in those arrays.
  `SetPlayerCamp` for the player's own camp dressing only.
- `FlowFestWorld.h`: your `// CampLife polish` block.
- Your folder, `Tools/author-camplife.py`, `Tools/import-camplife.py`.
- README: the "Camps match the browser simulator's mix" bullet; extend it.

You do not own: tent and car counts or positions (Crowd), the `Assets/Set`
meshes and materials, cars and their accessories (Cars, wave 4), the fire
field, structures, people, lights (place unlit bulbs; the Night 2 reserve
lights them).

## Build this, in this order

### 1. Clusters and furniture

Group camps into clusters: each canopy is a hub; a tent joins the nearest
hub within 12 m, else the nearest car within 8 m, else stands alone.
Compute a cluster centre on the hub's free side and dress it, seeded by
cluster index: 3 to 6 camp chairs in a loose ring (a folding quad chair
and a low moon chair, festival palette), a folding table with a stove and
cans at 60 percent, a cooler at 80 percent, a water jug at 50 percent, a
rug or tarp at 70 percent with props on it (hoops, poi, a staff), a
propane fire bowl at 30 percent, a hoodie or blanket over a chair back at
40 percent. Instanced, seeded, on `SurfaceAt`. Keep 1.0 m from any road
edge, 0.6 m outside every car footprint, 0.4 m from every tent, 3 m from
the player's tent and the `camp-*` landmarks. Pure exclusion functions in
your header, tested.

### 2. Colour in the air

Tapestries (1.5 by 2 m, procedural mandala, two seeded colours, gentle
wind) at 50 percent of hubs; prayer flags and pennants on a catenary at 40
percent; a clothesline at 25 percent; a vestibule tarp or folded mat by 30
percent of dome tent doors; a car awning (sheet from the roof edge to two
poles) at 30 percent of cars with a tent within 6 m.

### 3. Hammocks and unlit string lights

Hammocks where two trees stand 3 to 5 m apart within 15 m of a cluster, up
to one per cluster and about 20 on the site (the interview's hammock trees
along the lower campground tree line). Unlit bulbs along 60 percent of
canopy eaves through your own instance group with a custom-data channel
the Night 2 run can drive; no lights.

### 4. The player's camp

The same dressing at the player's tent so the story's "make camp" phase
lands in a real camp.

## Review

`camp` 20.0 and 17.5, `gate` 16.0, `overview` 19.5, `camp` 22.5 (nothing of
yours glowing), and `-Review camp -Explore` in a cluster at eye height.

## Done when

Clusters of tents and chairs around canopies with colour between them; the
cars read as parked beside camps, not as the camp; nothing on a road, in a
car, in a tent, under a trunk, or near the player's landmarks (tested);
about 25 instance groups at most; tests pass; frame time within +1.0 ms at
`camp` and `gate`.

## Judgement calls to record

Cluster rules and percentages; what you placed and then removed; the
instance-group count.
