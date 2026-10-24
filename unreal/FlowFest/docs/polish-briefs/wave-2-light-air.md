# Wave 2, run F: Light and air

Workstream `LightAir`. Folder `/Game/FlowFest/Assets/LightAir/`, prefix
`M_LightAir_`, new source files `FlowFestLightAir.h`, `FlowFestLightAir.cpp`,
`FlowFestLightAirTests.cpp`. Ready once wave 1 merges. Austen's chosen
focus after wave 1; it does not wait for the jam answers.

## Why this run matters

Every daytime capture shows clean, even light: the sun is warm, the clouds
shade the field, but the air is empty. Mid-May in a south-west Ohio
woodland at 20:00 has low sun shafts between the trunks, oak pollen and
dust drifting in the beams (mid-May is the peak of tree pollen here), haze
thickening toward the far tree lines, midges over the grass at dusk, and on
Friday morning mist lying in the hollows and over the damp sedge while the
first light hits the treetops. These are the cheapest changes that make
every view feel like a place rather than a render.

## You own

- In `FlowFestWorld.cpp`: nothing in the constructor (the Night run owns it
  this wave). Reach `Sun`, `Fog`, `Atmosphere` and `Clouds` from your own
  file through your friend block and set their properties in your
  `Initialise` call from `BeginPlay`. In `SetTimeOfDay` exactly one new
  line at the very end: `if (LightAir) LightAir->ApplyTimeOfDay(Hour);`
  and nothing else in that function. Your `ApplyTimeOfDay` owns the fog
  density and height by hour, the volumetric fog settings, the sun's
  light-shaft settings and the day-side grade (golden hour warmth, midday
  clarity); the Night run's call runs before yours and owns the exposure,
  sky light and moon. Do not set a value the Night run sets.
- `FlowFestWorld.h`: your `// LightAir polish` block.
- `FlowFest.Build.cs`: `"Niagara"` if not already present.
- `FlowFestHUD.cpp`: ONE edit, parsing `-FlowFestNoHUD` to draw nothing;
  `Tools/launch.ps1`: a `-NoHUD` switch that passes it. Nothing else in the
  HUD; the Hud run owns the rest in wave 5.
- Your folder, `Tools/author-lightair.py`, `Tools/import-lightair.py`.
- README: a paragraph after the sky sentence.

You do not own: the fire field, the sky dome, the stars, the exposure, the
crowd, the ground, the trees, the sun's path.

## Build this, in this order

### 1. Sun shafts and haze

- Volumetric fog on the height fog at low density, with the sun's
  volumetric scattering raised so beams show between trunks when the sun
  is under about 20 degrees (before 08:30 and after 18:30) and behind
  foliage; nearly invisible at midday. Light-shaft bloom and occlusion on
  the `Sun` for the low-sun hours only.
- Haze by hour: fog density and start distance so the far tree lines
  soften at 15:00 and clear in the cool of the evening; a faint warm tint
  at golden hour; never a saturated colour.
- Measure the volumetric fog's cost at `woods` 19.5 and `camp` 20.0; keep
  the grid at the engine default or lower; it is the one thing here that
  can cost real milliseconds.

### 2. Air: pollen, dust, midges

A Niagara system following the camera within 40 m, three emitters, all
sparse and cheap (under 400 particles in view):

- Pollen and dust motes: slow, lit by the sun (unlit sprites scaled by a
  daylight parameter), only in daylight, denser in the beams at low sun.
- Midges over the grass at dusk (19:30 to 21:30): small dark points in
  loose columns 1 to 2 m over the meadow, a few columns at a time.
- Fireflies: mid-May is early for them in Ohio; a handful at the woods
  edge after 21:30 (six to ten in view at most, soft yellow-green, 0.5 s
  on, 3 s off, hovering 0.5 to 2 m), none in the open and none before
  21:30. If the answer to the jam questions names them, raise the count.

### 3. Friday morning

Between 05:45 and 08:30 ground mist in the low ground east of the lower
camp, along the drainage toward the damp sedge, and in the hollow of the
overflow field: a second height fog or a Niagara sheet 1 to 2 m deep,
densest at 06:30, gone by 08:30; cold long shadows warming by 08:00; the
grass brighter with dew through the grade only (the Morning reserve run
owns a wet-look term if there is time).

### 4. Grade by hour

Golden hour 19:45 to 20:45 warmer and softer; midday cleaner and bluer in
the shade; morning cool. Day only; the Night run owns the night.

### 5. Clean captures

`-FlowFestNoHUD` and `-NoHUD`, as above, so the program captures can omit
the HUD from this wave on.

## Review

Views and hours (BEFORE and AFTER, same order, back to back):

- `woods` 15.0 and 19.5 (shafts between the trunks in the evening, haze
  at midday), `camp` 20.0 (golden hour, motes in the beams), `gate` 7.0
  and `overview` 7.0 (morning mist), `fire` 22.5 (unchanged apart from
  fireflies at the edge), `camp` 17.5.

Walk it: `-Review woods -Explore` at 19.5, look along the sun; `-Review
camp -Explore` at 6.5 and look east over the low ground.

## Done when

- Sun shafts show in the woods at 19.5 and not at 15.0; motes show in the
  beams; midges show at dusk at the meadow edge; mist lies in the hollows
  at 7.0 and is gone at 8.5.
- Nothing glows that should not; no saturated fog; the night is untouched.
- `-NoHUD` captures work.
- All existing tests pass; yours pass (the fog and grade curves by hour).
- Frame time within +1.0 ms on each view; if volumetric fog needs more,
  say what you traded (grid resolution, cull distance) and the number.

## Judgement calls to record

Fog densities and the volumetric grid setting; particle counts; the
firefly count; the mist's placement; how you kept clear of the Night run's
values.
