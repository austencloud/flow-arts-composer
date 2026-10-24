# Flow Fest polish program, round 2

Rewritten 2026-10-21 after Austen's first answers. Every implementation run
reads sections 1 and 2 before its brief. Shared run rules are in
`polish-briefs/common.md`; per-run briefs are beside it; the round-2
questions for Austen are in `polish-questions.md`.

What changed from round 1: the festival is in mid-May, not late summer; the
site is in south-west Ohio at 39.6 degrees north, not 43; there is no
bonfire, the fire jam is a roped amoeba lit by the props themselves; there
are about 400 people, not 38; the real structures from Austen's site
interview are not built yet; and juggling joins the program as a real
simulated activity. The fire jam waits for a conversation with Austen; the
season, the structures and the juggling bake can start now.

## 1. Art direction: what "gorgeous" means here

Flow Fest is the game's name for a real four-day flow-arts camping festival
(Kinetic Fire in the site record) on its real LiDAR-scanned site near Camden
and College Corner, Ohio, 39.59 degrees north, 84.79 degrees west, held
Thursday to Sunday in mid-May. The game plays the Thursday. Gorgeous here
means the feeling of having been there, in that week of the year, caught at
its best hours.

Mid-May in south-west Ohio, in order of what the eye notices:

- **Green.** Everything is fresh green: trees fully leafed in their first
  light green (the oaks last), hay fields young and green, winter wheat
  knee-high, lawn clearings lush and mown. No straw, no dry hay, no
  goldenrod. Crop fields are freshly tilled or just planted: bare dark soil
  with faint parallel rows, last year's stubble in places. Dandelion,
  clover and violets in the mown grass; honeysuckle and multiflora rose
  along the woods edges just coming into bloom.
- **Long evenings.** Sunrise about 06:25, sunset about 20:50, civil dusk
  about 21:20. Golden hour runs from about 19:45 to 20:45. The fire jam
  starts in real dusk and runs into a cool night.
- **Cool nights.** About 10 degrees C by midnight: hoodies, blankets, people
  wrapped up on the ground around the circle, breath not quite visible.
- **A first-quarter moon** high in the south-west at dusk, setting around
  midnight, so the early night is moon-lit and readable and the late night
  is truly dark. The summer Milky Way is not up until after midnight; the
  evening sky has the bright spring stars instead.
- **Rain is normal** at this festival (the barn is the rain shelter). The
  game's Thursday is dry; wet ground after a shower is a reserve item.

The reference feel, in order of importance:

1. **The fire jam after dark.** Not a bonfire. A roped amoeba of grass
   about 51 by 32 m in the middle of the fire field (Middle Earth), its
   edge marked by LED rope lying on the ground. Every 5 to 6 m around the
   edge a safety station: a camping chair facing in, a safety towel over
   its back, sometimes a small eternal flame. Behind the rope, chairs,
   wagons full of props, blankets, yoga mats and inflatable couches, with
   people sitting and watching. Inside, twenty or thirty people spinning
   fire and LED props and dancing, weaving in and out of one another, some
   playing to the audience, some lost in their own world. Jugglers among
   them, with fire clubs and passing. The light is the fire on the props
   and the glow of the rope; faces lit from below and from the side, the
   rest falling to moonlit grass.
2. **Golden hour on the site.** Low warm sun through fresh-leafed trees on
   the ridges, long shadows across green grass, tents and cars and canopies
   in a loose village with chairs, rugs, tapestries and hoops leaning on
   everything, people in twos and threes, someone practising in a gap
   between two cars. Pollen and dust in the light shafts.
3. **The real place.** The lower campground loop with its year-round
   building and check-in canopy, the showcase stage with its teal roof, the
   juggling tent, the food vendors' white structure, the barn, the
   abandoned stage in the trees, Vendor Village's decorated path, the pink
   workshop cabin, the lodges and their porch, the top parking. The site
   interview places all of them.
4. **Four hundred people.** A village, not a clump: car camps in the loop,
   tent bands along the tree lines, the top parking filling up, people
   everywhere there is room. Jam circles wherever people gather.
5. **Friday morning.** Dew, mist in the hollows, the rope and chairs still
   around the empty circle, almost nobody up.

What it is not: not a theme park, not neon, not a music-festival main
stage, not saturated, not clean, not autumn. A flow-arts festival is
handmade: tapestries from a bedroom wall, a canopy with one leg on a cooler,
hoops on a car roof, prayer flags, a hand-lettered sign. Everything a run
adds should look like someone brought it in a car.

Rules of taste for every run:

- Warm light against cool dark. Fire, string lights, lanterns and the
  evening sun are warm; sky, shadow, moonlight and mist are cool. Do not
  warm the whole frame.
- Dark is dark. Night exposure may not lift the field to dusk. The jam is
  lit by its own props and rope; nothing else competes.
- Small, specific and slightly wrong beats big and symmetric. A crooked
  sign on a stake beats a kiosk; chairs at odd angles beat a row; an amoeba
  beats a circle.
- Nothing floats, nothing clips, nothing is placed on a road or in a tent.
  Every object sits on sampled ground.
- Instances, not actors. Hashed, deterministic placement so saves and
  reviews are stable.
- Procedural only. Nothing is bought, downloaded or copied in. Blender
  authoring, material graphs built by script, engine primitives, C++
  placement, and Austen's own juggling engine.

## 2. The biggest gaps, ranked by payoff per hour

Evidence is from the review captures taken on this branch on 2026-10-21
(1080p, offscreen, HUD on) and from the site record
(`docs/superpowers/specs/flow-fest-sim/site-labels-interview.md`, validated
by Austen 2026-09-03). Timings are the game-frame average after warm-up,
noisy by about 1 ms between identical runs.

| View, hour | Frame ms | What the capture shows |
| --- | --- | --- |
| fire 21.5 | 21.9 | Flat deep-blue sky, no stars, two crossed flame cards over a bonfire ring that does not exist at the real event, a white canopy glowing as if lit, nobody near it. |
| fire 20.25 | 18.9 | Identical night look, because the sun model sets at 18:00. |
| fire 17.5 | 19.5 | Sunset colour at half past five. Dry straw-coloured grass, which is August, not May. |
| camp 19.75 | 17.7 | Full night at a time that is golden hour in May. Cars in rows read as a parking lot. |
| camp 17.5 | 17.0 | Good light and trees, but dry grass, tents and cars in rows, nothing between them. |
| gate 16 | 19.0 | A kiosk, three people, floating text, dry field. The real check-in is a canopy beside the year-round building at the loop junction. |
| gate 7.5 | 13.6 | Morning reads as midday with a low sun: no mist, no dew. |
| overview 17 | 18.6 | The fire field is two canopies on a lawn; no stage, no juggling tent, no barn, no vendor path. |
| overview 20.5 | 15.0 | Near-black field with one glow and a few dots. |
| woods 15 | 19.3 | Good after the woods work; not in scope here. |

Ranked gaps, with the wave that takes each:

1. **The fire jam is a bonfire (wave 2, Jam; waits for Austen).** The real
   jam is a roped amoeba with safety stations, LED rope, chairs and wagons,
   people weaving inside, jugglers among them. The emotional centre of the
   game is the wrong thing. Cost: one run after the conversation, a second
   run for passing and fire clubs.
2. **The season, the sun and the latitude are wrong (wave 1, Season).** The
   sun model is a 43 degree, mid-August path that sets at 18:00; the grass
   and ground are dry straw; the fields are hay and stubble. Mid-May at
   39.6 degrees sets at 20:50 with green everything and tilled fields. One
   run fixes the sun, the clock, the greens, the fields, and moves every
   story hour and review hour to the real evening. Payoff: every view.
3. **The real structures are not there (wave 1, Structures).** The site
   interview pins a stage, a juggling tent, a food structure, a barn, an
   abandoned stage, a year-round building and check-in canopy, cabins,
   lodges, workshop spots and toilet clusters, with coordinates in the same
   frame the game uses. The game has a gatehouse, a bonfire and two
   canopies. Payoff: the overview, the arrival, the fire field by day, and
   every walk.
4. **No juggling (wave 1, Juggling bake; wave 4, Jam 2).** Austen's own
   deterministic passing engine (18 patterns, clubs with spin, hand loops
   scaled to height) can be baked to frames and played in Unreal on the
   existing hand IK with the existing club prop. That gives jugglers at
   the juggling tent by day and in the circle by night, and passing pairs.
5. **Thirty-eight people on a site of four hundred (wave 3, Crowd).** Needs
   a tiered crowd (full characters near the player, cheap instanced
   people beyond) and a camping distribution Austen can correct. The
   distribution is a round-2 question; the tier technology is not.
6. **The night sky and night light (wave 2, Night).** No stars, no moon
   disc, exposure that floors at 0 EV, a sky light that makes canopies
   glow, lantern globes on sticks. Separate from the jam: the jam lights
   itself; the night run owns the sky, the exposure and the string lights.
7. **Nothing is in the air (wave 2, LightAir).** No sun shafts, no pollen
   or dust in the light, no morning mist, no haze by hour. Austen's chosen
   next focus after wave 1.
8. **The camps are a parking lot (wave 3, CampLife).** Nothing between the
   tents and cars: no chairs, rugs, tapestries, coolers, hammocks, flags.
9. **The arrival (wave 3, Arrival).** Signs are floating text; no queue, no
   wristbands, no counter-clockwise loop rule made visible, no decorated
   path through Vendor Village.
10. **Cars are showroom cars; the site is silent; the HUD covers a sixth
    of the frame (waves 4 and 5).**

Not in this program: character animation capture (there are no sit or talk
clips; runs use procedural poses or substitutes), new character meshes,
weather, the woods density (done), gameplay systems beyond what the jam and
juggling need.

## 3. The waves

Up to three headless runs per wave, each in its own worktree and branch,
each owning disjoint content folders, materials and C++ functions. Runs
are about four hours; a wave with review and merge is five to six. The
window allows five waves and a reserve.

| Wave | Runs | Status |
| --- | --- | --- |
| 1 | Season, Structures, Juggling bake | Ready to launch now. No answer needed; each brief states its defaults and the round-2 answers correct them later. |
| 2 | Jam, Night, LightAir | Jam waits for the round-2 conversation. Night and LightAir are ready and can start as soon as wave 1 merges; if the conversation is late, run Night and LightAir with a wave-3 run and put Jam in wave 3. |
| 3 | Crowd, CampLife, Arrival | Crowd's distribution waits for question 7; its tier technology does not. |
| 4 | Jam 2 (passing, fire clubs, live engine), Cars, Sound | After Jam. |
| 5 | Journey review, Perf, Hud and photo | After everything. |
| 6 | Reserve: Morning, Night 2, Crowd 2, Fixes | If time remains. |

Between waves the coordinator reads each run's report and captures, checks
the diff for ownership or shared-store violations, rebuilds `main` with the
wave merged, retakes the program captures (section 5), records timings, and
fills the next wave's answers blocks. A run that fails its gates is merged
only for the scoped commits that pass.

Ownership summary for wave 1, so the three runs cannot collide:

- Season: `SunRotationAt`, the daylight curve in `SetTimeOfDay` (not the
  night exposure, sky or lights), the story and crowd clock constants, the
  review default hours, the ground and grass dryness paint, the field
  paint, the tree tint parameters, its own flower and tilled-row meshes.
- Structures: `BuildFestivalLandmarks` except the `if (Fire)` block (which
  it leaves untouched; the bonfire stays until the Jam run replaces the
  fire field in wave 2), `AddSign`, the `Gatehouse`, `Canopy`, `Signpost`
  set pieces, the landmark table, its own buildings.
- Juggling: the new `Tools/bake-juggling.mjs`, `Content/Data/juggling/`,
  `FlowFestJuggling.*`, one additive hand-target method on the shared
  avatar component, a `-Showcase juggling` preset, and a daytime placement
  at the juggling tent only.

## 4. Acceptance

A wave is accepted when, on the merged `main`:

- Each run's "Done when" list holds, checked against the run's captures and
  one coordinator capture per review view.
- The program views (`fire` 22.5 and 20.5, `camp` 20.0 and 22.5, `gate`
  16 and 7.0, `overview` 19.5, `woods` 15) look better than the previous
  wave's to the coordinator's eye, judged against section 1, and none
  looks worse. (These are the hours after the Season run; before it, the
  round-1 hours apply.)
- Nothing floats, clips, blocks a road or path, or stands in a tent, in
  those captures and on one walk from the check-in to the fire field.
- Automation tests under `FlowFest` pass with `-NullRHI`.
- No asset outside a run's folder was re-saved; the map was not saved; the
  junction is intact.
- Saves made before the wave still load.

The program is accepted when the journey walk-through in wave 5 finds no
item worse than "small" and a showcase set of twelve captures is chosen.

## 5. Performance

Target: 60 fps at 1600x900 on Austen's PC with the current scalability,
16.7 ms per frame. No program view is there today.

Rules for every run:

- At most +1.0 ms on any review view at its program hour, +1.5 ms at the
  fire field at night. Measure three offscreen runs, median of averages.
  Ship the part that fits; report the rest.
- No shadow-casting local lights at all after the bonfire goes (the jam's
  prop fire uses the prop component's own small lights, non-shadow).
  Everything is unshadowed, radius-capped and distance-culled.
- Every new instance group has a cull distance; every Niagara system has a
  spawn-rate falloff by distance and a hard particle cap.
- Nanite for authored meshes; translucency only on fire, smoke, mist, LED
  rope glow and lantern glass.
- The crowd above about 70 full characters is instanced, not actors.
- The perf pass in wave 5 brings every view under 16.7 ms or reports which
  cannot and why, in this order of knobs: cull distances, Niagara counts at
  distance, light radii, Lumen scene detail, then TSR screen percentage.

Baseline table (this branch, 2026-10-21, before wave 1): fire 21.5 at
21.9 ms; fire 20.25 at 18.9; fire 17.5 at 19.5; camp 19.75 at 17.7; camp
17.5 at 17.0; gate 16 at 19.0; gate 7.5 at 13.6; overview 17 at 18.6;
overview 20.5 at 15.0; woods 15 at 19.3. The coordinator appends one row
per wave, at the new hours once the Season run has merged.
