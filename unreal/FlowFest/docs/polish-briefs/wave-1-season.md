# Wave 1, run A: Mid-May at 39.6 degrees north

Workstream `Season`. Folder `/Game/FlowFest/Assets/Season/`, prefix
`M_Season_`, new source files `FlowFestSeason.h`, `FlowFestSeason.cpp`,
`FlowFestSeasonTests.cpp`. Ready to launch; no answer needed.

## The facts this run is built on

- The site is near Camden and College Corner, Ohio: latitude 39.5896 north,
  longitude 84.7858 west, Eastern Daylight Time (UTC-4). The festival is
  mid-May; the game's Thursday is May 14. The code and README say 43
  degrees north and late summer. Both are wrong.
- Sun on May 14 at that site: declination about +18.9 degrees; solar noon
  about 13:35 EDT; sunrise about 06:25 at a bearing of about 65 degrees
  (east-north-east); sunset about 20:50 at about 295 degrees
  (west-north-west); noon altitude about 69 degrees; civil dusk about
  21:20; the sky fully dark by about 22:40. Golden hour is roughly 19:45
  to 20:45.
- The orthophoto under the ground is USDA NAIP flown 2023-05-22, so what
  `Tools/classify-fields.mjs` calls "dry" is mid-May bare tilled soil and
  last year's stubble, and its "green" is young hay or winter wheat. The
  classifier stays; what the ground paints for each class changes.
- Mid-May vegetation here: trees fully leafed in a fresh light green (oaks
  last and lightest), mown clearings lush, hay fields green and short,
  winter wheat green and knee-high, crop fields dark tilled soil with
  faint rows, dandelion and clover and violets in the mown grass,
  honeysuckle and multiflora rose starting to bloom at the woods edges. No
  straw, no stubble-coloured grass, no goldenrod, no autumn anything.

## Why this run matters

Every capture is August: straw-coloured grass, hay-and-stubble fields, a
sun that sets at 18:00 so the "evening" captures are night. Fixing the sun,
the clock and the greens moves every view to the right season at once and
gives every later run the right light to build against.

## You own

- `SunRotationAt` in `FlowFestWorld.cpp` and its declaration; the daylight
  curve at the top of `SetTimeOfDay` (`Daylight`, `SunLux`, `Night`, the
  fog density lerp and the warm/cool grade constants) but NOT the night
  exposure, sky light, moon or post-process night values, which the Night
  run takes in wave 2. Keep the function's shape; change constants and the
  altitude curve only.
- The clock: the story phase hours in `FlowFestCharacter.cpp` (the block
  around `Hour = DepartureChoice == 0 ? 16.f : ...`), the `CycleTime`
  presets (`{16.f, 18.5f, 23.f, 8.1f}`), the review default hours in
  `PlaceReviewCamera` (the `SetTimeOfDay(bWoods ? 15.f : ...)` line), and
  in `FlowFestCrowd.cpp` the fire-window constants (`1240.f` start of fire
  turns; keep `1560.f` as the night end). Nothing else in those files.
- In `FlowFestEcologyComponent.cpp`: the `Grow` lambda's `Dryness` and
  `Brightness` formulas and the `ColorDryness` table; the hay-tuft pass
  (find it by the README sentence "about 2,300 short hay tufts"). Nothing
  else in that file.
- In `Tools/import-assets.py`: the meadow material's `green` and `straw`
  colour ramps, the ground material's `dryness` lerp constants and
  `GroundMeadow`/`GroundDetail` tints, and the farm-field paint section
  (what the two field classes draw). You may rerun `import-assets.py` with
  `--only=` for exactly the assets those sections create (`M_MeadowGrass`,
  `M_Fern` if it shares the ramp, `M_Ground`) and nothing else; say in the
  report which `--only` values you used. No other run in this wave touches
  these assets.
- Tree leaf tint: if the tree leaf materials under `Assets/Trees` expose a
  colour or tint parameter, or read a material parameter collection, you
  may set that parameter through a collection or instance in your folder.
  Do not re-save the tree materials. If no parameter exists, leave the
  trees and say so.
- Your folder, `Tools/author-season.py`, `Tools/import-season.py`, and in
  `FlowFestEnvironmentTests.cpp` the sun tests only.
- README: the sentence "The sun follows a late-summer path for the site's
  43 degrees north..." and the sentence about green crop rows and straw
  hay; rewrite both.

You do not own: the night side of lighting, the fire, structures, people,
cars, tents, roads, the woods placement, the HUD.

## Build this, in this order

Commit and capture after each step. Steps 1 to 3 are the core.

### 1. The real sun, and the clock that follows it

- `SunRotationAt(Hour)`: latitude 39.59, declination +18.9, hour angle
  from solar noon at 13.58 (EDT). Keep it static and pure. Pin it with
  tests: altitude crosses zero between 06.2 and 06.6 and between 20.6 and
  21.0; altitude at 13.58 is 69 plus or minus 1.5 degrees; bearing at
  sunrise is 65 plus or minus 4 and at sunset 295 plus or minus 4; the
  existing test that the sun turns through the afternoon still passes.
- `SetTimeOfDay`'s daylight curve: keep the formulas, but check that civil
  dusk falls near 21:20 (daylight near zero when the sun is 6 degrees
  down) and that 22:40 is fully dark; retune the `+8 / 24` and `+3 / 9`
  offsets only if the dusk is too long or too short. Do not touch the
  night exposure or sky-light values.
- Move the clock. Replace these constants, and nothing else, so the story
  and the crowd meet the real evening:

| What | Was | Now |
| --- | --- | --- |
| Departure choices | 16.0 / 18.0 / 19.25 | 16.0 / 18.0 / 19.25 (unchanged; all daylight) |
| Walk home, make camp | 19.0 | 19.5 |
| Walk to the festival, festival night | 19.0 | 21.0 |
| Night free roam, night return | 23.0 | 23.5 |
| Morning | 8.1 | 7.0 |
| Crowd fire window start (sim minute) | 1240 (20:40) | 1290 (21:30) |
| Cycle presets | 16, 18.5, 23, 8.1 | 16, 20.25, 22.5, 7 |
| Review default: fire | 23 | 22.5 |
| Review default: camp | 17.5 | 20.0 |
| Review default: overview | 17 | 19.5 |
| Review default: gate, woods | 16, 15 | unchanged |

- The camp review camera aims into the sun through `SunRotationAt` at its
  default hour, so at 20.0 it turns to the west-north-west; that is
  expected. Check that it still frames the lower camp and not the tree
  wall; if it does not, say so in the report rather than moving the camera.

### 2. Green grass, green fields, tilled soil

- Meadow grass: shift the `green` and `straw` ramps in `import-assets.py`
  so the "dry" end is a lighter yellow-green (young grass that has had
  sun) rather than straw, and the "green" end is a fresh saturated spring
  green. In `FlowFestEcologyComponent.cpp` lower the base dryness
  (`.42f` in the open, `.08f` in shade) so most clumps sit in the green
  half, keep the patchiness so the field still varies, and let the
  trampled and car-side clumps go paler, not browner.
- Ground: the `dryness` lerp that dries "broad patches toward straw"
  becomes a lerp between two greens (lush and sun-paled); the
  `GroundMeadow`/`GroundDetail` tints lose their tan. The litter under the
  trees stays as it is.
- Farm fields: the "green" class paints young hay or winter wheat: an even
  green with a faint drill-row stripe (about 19 cm apart, barely visible,
  so it reads as texture, not rows) and no tufts. The "dry" class paints
  freshly tilled or just-planted soil: dark brown, slightly lighter on the
  ridges of faint rows about 76 cm apart, with sparse patches of last
  year's pale stubble where the orthophoto is lightest. Keep each field's
  tracks from the photo as the existing code does.
- Hay tufts: on tilled fields replace the 2,300 hay tufts with a sparser
  scatter of small weeds (a low green rosette mesh you author, about 600,
  near field edges); on green fields no tufts. Keep the instance counts
  at or below the old ones.

### 3. Spring bloom in the mown grass and at the edges

Author in Blender, in your folder, four small instanced meshes with plain
procedural colour: a dandelion head (yellow disc on a 12 cm stem), a
dandelion clock (white sphere, smaller), a clover head (pale pink sphere
with two leaves), a violet (three purple quads). Place them on the mown
clearings and the camp lawns (the ground-family mask's lawn class, or the
camp landmark areas): dandelions in drifts at about 1 per 2 square metres
in drifts and nothing elsewhere, clover scattered, violets at the shade
edge. Seeded, culled at 60 m, no more than 8,000 instances in total. Along
the woods edges (where canopy cover drops to open) place a honeysuckle
bloom mesh (a cluster of white and cream quads on a thin stem, waist
height) every 4 to 8 m. All through your own instance groups.

### 4. Tree tint (if a parameter exists)

Shift the tree leaves about 10 percent toward yellow-green and 5 percent
lighter, more for the oaks if the families are distinguishable, through
the parameter route described under "You own". Compare the woods view at
15.0 before and after; if it reads as fake, pull it back.

## Review

Views and hours (BEFORE and AFTER, same order, back to back). Your before
captures at the old default hours and your after captures at the new ones
are both useful; take both sets.

- `camp` 17.5 and 20.0; `fire` 17.5, 20.5 and 22.5; `gate` 16.0 and 7.0;
  `overview` 17.0 and 19.5; `woods` 15.0.

Walk it: `-Review camp -Explore` at 20.0 and look at the grass at your
feet and at the field beyond the road.

## Done when

- The sun tests pin sunrise, noon and sunset to the real values; 20:00 is
  golden hour and 22:30 is night in the captures.
- Grass reads as fresh May green in every view; fields read as tilled soil
  with faint rows or as young green crop; no straw anywhere but the
  stubble patches.
- Dandelions show in the mown grass of the `camp` and `gate` views at eye
  height and read as a yellow haze from the overview, not as a pattern.
- The story phases, the crowd's fire window, the cycle presets and the
  review defaults use the table above.
- All existing tests pass; your test file passes.
- Frame time within +1.0 ms of BEFORE at `camp`, `gate` and `overview`
  (compare same-hour pairs).

## Judgement calls to record

The exact ramps and dryness constants; how you handled the tree tint; the
weed and flower counts; the `--only` values you reran; whether the camp
review camera still frames the camp at 20.0.
