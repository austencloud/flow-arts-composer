# Wave 1, run B: The real structures

Workstream `Structures`. Folder `/Game/FlowFest/Assets/Structures/`, prefix
`M_Structures_`, new source files `FlowFestStructures.h`,
`FlowFestStructures.cpp`, `FlowFestStructuresTests.cpp`. Ready to launch;
round-2 question 8 corrects your defaults later, so make plain, honest
choices and record them.

## The source of truth

`docs/superpowers/specs/flow-fest-sim/site-labels-interview.md` at the repo
root: Austen's own account of what stands on the site, with world
coordinates in metres (x east, z south), validated by him on 2026-09-03.
Its frame is the game's frame: `site.json` puts the `fire` landmark at
(89, -113.5) and the interview puts the fire circle at (90.5, -119.5); the
loop junction at (319.6, -105.5) matches the drive geometry. Use `ToWorld`
and `SurfaceAt` as every builder does. Also read
`austen-site-markers.json` beside it (the Middle Earth clearing polygon,
the dip station and the entrance archway with facings).

## Why this run matters

The game has a gatehouse the size of a phone booth, one workshop canopy, one
food canopy and floating text. The real site has a year-round building with
a check-in canopy beside it, a showcase stage with a teal roof, a juggling
tent, a white food-vendor structure, a barn, an abandoned stage in the
trees, a pink workshop cabin, lodges with a covered porch, a main cabin,
toilet and shower clusters, seven workshop spots and a decorated path
through Vendor Village. Every capture, the arrival and every walk gain from
these being where they are.

## You own

- In `FlowFestWorld.cpp`: all of `BuildFestivalLandmarks` EXCEPT the
  `if (Fire)` block, which you must leave exactly as it is (the Jam run
  replaces it in wave 2); `AddSign`; the landmark table lookups. Remove the
  Gatehouse, the workshop canopy, the food canopy and benches, and every
  `TextRenderComponent` sign, and build the real things from your file,
  called once from `BeginPlay` where `BuildFestivalLandmarks` is called.
  Keep the landmark ids `gate`, `workshop`, `food`, `fire`, `camp-*`,
  `parking`, `start` and their positions; other code (the crowd, the
  story, the review cameras) reads them. You may add new landmark ids.
- The set pieces `Gatehouse`, `Canopy`, `Signpost` in `Assets/Set` may be
  left unused; do not delete or re-save them.
- Your folder, `Tools/author-structures.py`, `Tools/import-structures.py`.
- README: the bullets under Sources that mention the gatehouse, workshop
  field or food canopy; add a paragraph listing the real structures.

You do not own: the fire block and its light, the crowd, tents, cars,
grass, ground, trees, roads, the sun, the HUD. Keep every road and foot
connector clear (test the clearance the way `FlowFestRoadTests.cpp`
tests roads) and keep the gate interaction trigger where it is.

## What to build, where, and the plain default look

Author each building in Blender from beams, cubes and sheets with plain
materials (weathered grey wood, galvanised and painted metal roofs, white
and coloured canvas, concrete pads). Footprints come from the orthophoto
where the interview gives a bounding box; otherwise from the sizes below.
Orient long axes with the nearest road or the clearing edge. Place on
`SurfaceAt` at the footprint's lowest corner and let the floor slab hide
the slope. Every repeated thing (canopies, tables, chairs, toilets,
stanchions, art panels) is instanced.

### Step 1: Middle Earth (the fire field)

The clearing polygon is in the markers file; it is bare grass with no
trees. Build, in this order:

- **Showcase stage**, teal roof, centred (126.8, -98.6), facing west toward
  the circle: a raised deck 8 by 6 m at 0.8 m, four posts, a peaked teal
  metal roof overhanging 1 m, a black fabric backdrop, two speaker boxes on
  stands at the front corners, a short ramp at the back.
- **Juggling tent**, centred (93.6, -87.3): a 10 by 10 m frame tent, white
  canvas, 3.5 m eaves and a 5 m peak, open sides (rolled-up walls at the
  eaves), a wooden floor is NOT present (grass). Leave the grass south-east
  of it (x 88 to 100, z -82 to -76) clear; the Juggling run puts jugglers
  there.
- **Food vendors at the white structure**, centred (55.9, -96.4): a white
  gable-roofed open pavilion 12 by 8 m on posts over a concrete pad, two
  food booths (trailer-sized boxes with a serving window, awning and a
  chalkboard sign) parked beside it, four picnic tables under the roof.
- **Volunteer HQ** (125.5, -128.4) and **first aid** (125.5, -115.0): each a
  3 by 3 m pop-up canopy with a folding table, two chairs; the first-aid
  canopy white with a red cross flag, the HQ with a whiteboard and a stack
  of water flats.
- **Dip station** at the marker (68.5, -144), facing 153 degrees: a 3 by
  3 m canopy over a folding table with fuel cans, a steel dip bucket, a
  spin-off barrel and a fire extinguisher, a rope line on four stanchions
  around it. The Jam run adds the night dressing; you build the furniture.
- **Entrance archway** at the marker (77.9, -138), facing 142 degrees: two
  posts 3 m apart and 3.5 m tall with a curved top, wrapped in fabric and
  unlit string lights (the Night run lights them), a hand-painted sign
  board over it.
- **Walk-in** at (111.8, -141.9): a gap in the clearing edge with a
  trampled strip; a sandwich board.
- **Workshops W1 to W4** at (72, -134), (106, -131), (61, -110), (110, -89):
  each a 6 by 6 m pop-up canopy in a plain colour with a circle of six camp
  chairs under and around it, and a painted board on a stake naming the
  workshop spot ("W1" and so on, no fake titles).
- **Toilets and showers, Middle Earth west edge** (66, -100): a row of
  four portable toilets (1.2 by 1.2 by 2.3 m, plain blue-grey with a white
  roof and a door) plus a shower trailer (a 6 by 2.4 m box with three doors
  and a water tank) on a gravel pad.

Delete the old workshop canopy and the old food canopy and their signs.

### Step 2: The lower campground loop

- **Main year-round building** at (305.4, -114.0): a plain one-storey
  building 12 by 10 m with a grey pitched metal roof, a porch step, two
  windows and a door facing the loop; a gravel apron in front.
- **Check-in canopy** at (319.6, -116.2), on the driver's left as the loop
  is entered: a 3 by 3 m canopy with a folding table, a cash box, a stack
  of wristbands (a bright small pile), a clipboard, two chairs, a cooler, a
  sandwich board that says CHECK IN, four cones along the drive edge, and a
  hand-painted sign at the junction reading one way counter-clockwise (an
  arrow and the words). Remove the old Gatehouse and its FLOW FEST text.
  Keep the `gate` landmark id and position and the story's check-in
  trigger exactly where they are; test that the canopy footprint does not
  overlap the drive.
- **Toilets, campground north arc** (266, -178), **south arc** (262, -79)
  with showers, and **near the gate** (312, -101): the same toilet row and
  shower trailer meshes.
- **Workshop W5** at (213, -95), the T where the Vendor Village road meets
  the loop's south-west corner: a 6 by 6 m canopy with chairs, like W1.

### Step 3: Vendor Village, the barn and the abandoned stage

- **Barn** at (187.5, -120.9): a gambrel-roofed pole barn 18 by 12 m, 7 m
  to the ridge, weathered grey boards, a galvanised roof, a wide sliding
  door on the side facing the path, open. Rain shelter; nothing inside but
  a few hay bales and folding tables.
- **Abandoned stage** at (135 to 148, -121), under the trees east of the
  fire field: a weathered 8 by 5 m wooden deck at 0.6 m with a leaning
  post-and-beam roof frame, half its roofing gone, moss-dark boards.
- **The decorated path** through Vendor Village: it follows the line of the
  loop road's bottom, slightly diagonal, up into Middle Earth, then veers
  left up the road. Trace it as a polyline from the loop's south-west
  corner (about 215, -95) through (175, -110) to the fire field's east
  edge (about 131, -111), sampled every metre on `SurfaceAt`. Along it,
  every 6 to 10 m, hang art between the trees: fabric panels (1 by 1.5 m
  quads in seeded colours with a simple painted motif), rope with hanging
  rings and streamers, a string of paper lanterns (unlit; the Night run
  lights them). Keep the path itself clear 2 m wide.
- **Vendor booths**: six to eight 3 by 3 m canopies along the path's east
  half and in the clearing at the bottom of the H2 block (about 160 to
  200, -80 to -60), each with a table, a rack of hanging fabric or a
  display of hoops and poi, a chair; open sides.

### Step 4: The upper section (if time allows)

- **Pink workshop cabin** (W6) centred (-15, -141), 14 by 11 m, rose-pink
  roof, pale walls, a porch; **grey building** centred (-35, -140), 15 by
  11 m, dark grey roof, closed.
- **Lodges and covered porch** in the box (-42 to 6, -70 to -48): two long
  low buildings with a shared covered porch on the clearing side.
- **Main cabin** in the box (2 to 40, -100 to -78): a large log-sided
  lodge with a green metal roof. Not part of the festival; no dressing.
- **Workshop W7** at (-27, -83) on the lawn north of the porch: a canopy
  like W1.
- **Top parking pad** (-87 to -22, -44 to 19): if the ground does not
  already read as a hard pale pad there, lay a thin gravel mesh with a
  dithered edge on `SurfaceAt`.

## Review

Views and hours (BEFORE and AFTER, same order, back to back):

- `overview` 17.0, `gate` 16.0, `fire` 17.5 (Middle Earth by day from the
  circle camera), `camp` 17.5. (If the Season run merges first the
  coordinator will retake these at the new hours; use whichever hours the
  defaults give you when you start, and say which.)

Walk it: `-Review gate -Explore` from the check-in around the loop and up
the decorated path to the fire field; `-Review fire -Explore` around
Middle Earth. Screenshot each structure from eye height with `HighResShot 1`.

## Done when

- Every Step 1 and Step 2 structure stands at its interview coordinate,
  on the ground, oriented sensibly, with no part on a road or path; the
  old gatehouse, workshop canopy, food canopy and text signs are gone.
- The overview reads as the real site: stage, tent, food pavilion and
  barn visible; the loop has its building and canopy.
- The check-in trigger and all drives stay clear; a test proves the
  footprints against the roads and the trigger.
- Every structure's walls are two-sided or closed so nothing shows through
  from inside; every roof overhangs; nothing z-fights its pad.
- All existing tests pass; your test file passes.
- Frame time within +1.0 ms at `overview` and `gate`.

## Judgement calls to record

Every size, colour and material you guessed; which steps you reached;
anything in the interview you could not place; the polyline you used for
the decorated path.
