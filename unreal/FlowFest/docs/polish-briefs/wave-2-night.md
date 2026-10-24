# Wave 2, run E: Night at 39.6 degrees north

Workstream `Night`. Folder `/Game/FlowFest/Assets/Night/`, prefix `M_Night_`,
new source files `FlowFestNight.h`, `FlowFestNight.cpp`,
`FlowFestNightTests.cpp`. Ready once wave 1 merges (it needs the Season
run's sun and clock, and the Structures run's archway and path lanterns to
light). It does not wait for Austen; nothing in it depends on the fire jam
answers, and it must not touch the fire.

## Answers from Austen (filled in before launch)

- Date and sun: mid-May, real path (Season run). Sunset 20:50, civil dusk
  21:20, dark by 22:40, sunrise 06:25.
- Moon: first quarter. At sunset it is high in the south-south-west (about
  55 degrees up), sinking west and setting about 00:30. Its light is about
  0.03 lux at the zenith, enough to read the field by once the eye adapts.
- Stars: the spring sky. At 22:30 Arcturus is near the zenith, Leo in the
  west, Vega rising in the north-east, the Big Dipper high in the north.
  The summer Milky Way is not up; the band lies along the north-eastern
  horizon until after midnight and rises through 02:00. The winter Milky
  Way sets in the west in twilight and does not show.
- Q4 other light (from the Jam conversation; DEFAULT until answered): no
  floodlights; string lights only where the Structures run hung them unlit
  (the archway, the Vendor Village path lanterns) and at the showcase stage.

## Why this run matters

The night sky is a flat gradient with no stars and no moon; the exposure
floors at 0 EV so the night is a dim blue dusk; the sky light makes white
canopies glow; the lanterns are globes on sticks. After wave 1 the evening
is right until 21:20 and then wrong. This run owns everything about the
night that is not the jam itself: the sky, the eye, the moon and the small
lights of the site. The Jam run, in the same wave, owns the fire field and
lights it from the props; your night must be dark enough for that to be the
brightest thing on the site.

## You own

- In `FlowFestWorld.cpp`: `BuildLanterns` (replace it), and in the
  constructor the `Moon`, `SkyLight` and `PostProcess` setup (not `Sun`,
  `Fog`, `Atmosphere` or `Clouds`; the LightAir run reaches those from its
  own file). In `SetTimeOfDay` exactly one new line at the very end:
  `if (Night) Night->ApplyTimeOfDay(Hour);` and nothing else in that
  function. Your `ApplyTimeOfDay` overrides the night-side values (sky
  light, moon, post-process exposure and grade) after the existing code
  has run, and returns every value to what the existing code set when
  `Daylight` is 1, so a 16:00 capture is unchanged.
- `FlowFestWorld.h`: your `// Night polish` block.
- `FlowFest.Build.cs`: add `"Niagara"` to the public dependencies if it is
  not there (the Jam and LightAir runs add the same line if they get there
  first; identical lines merge).
- Your folder, `Tools/author-night.py`, `Tools/import-night.py`.
- README: the sentence in "Native scope and limits" that starts "The sky has
  volumetric fair-weather cumulus"; extend it.

You do not own: the fire field and anything in it (the `if (Fire)` block,
the fire light, the rope; the Jam run), the daylight curve and the sun
(Season), the fog and sun shafts (LightAir), the crowd, tents, cars,
structures, the HUD. Place no people.

## Build this, in this order

Commit and capture after each step. Steps 1 to 3 are the core.

### 1. Night exposure and grade

- Let the eye adapt: allow `AutoExposureMinBrightness` down to about -2
  EV100 from civil dusk, reaching the floor by 22:40, and use local
  exposure so lit faces and lit props keep detail while the far field goes
  dark. Nothing lit by the moon alone should be brighter than mid-grey.
- Grade: shadows toward blue-grey, saturation slightly down, vignette a
  touch up, bloom down from 0.85 to about 0.4 at night so fire and LEDs
  stay crisp.
- Sky light at night far below today's 0.8 so canopies, cars and tents
  stop glowing; the moon light is the fill until it sets, and after 00:30
  the fill is starlight (about 0.002 lux; a very faint cool sky light).
- Every value lerps back to its daytime value by `Daylight`. Check the
  `camp` view at 17.5 and the `fire` view at 16.0 against BEFORE.

### 2. The sky: spring stars, the moon, the horizon

A sky dome: a large inverted sphere (authored, or the engine sphere scaled
to 50 km and flipped) with `M_Night_Sky`, unlit, two-sided, the material's
`Is Sky` flag on so the atmosphere composites over it. Emissive:

- Stars from a hash of the view direction on a fine grid, about 1 in 40
  cells lit, brightness from a second hash (few bright, most faint), a
  slight warm or cool tint per star. Rotate about the celestial pole at
  altitude 39.6 degrees due north by the hour (15 degrees per hour). Pin a
  handful of real bright stars by right ascension and declination
  (Arcturus, Vega, Spica, Regulus, Capella, Deneb, Altair, Polaris and the
  seven of the Dipper) so the sky is recognisably May; the rest is hashed.
  Write the sidereal rotation as a pure function and test that Polaris
  stays put and Arcturus is within 10 degrees of the zenith at 22:30.
- The Milky Way as a faint band on a great circle, with low-frequency
  noise for the dust lanes; at 22:30 it hugs the northern and
  north-eastern horizon and climbs through the small hours. Keep it faint;
  it is a late-night thing in May.
- The moon disc at the `Moon` light's direction with a first-quarter
  terminator (lit side toward the sun), a faint glow around it, and the
  `Moon` light's direction following the real path for the night (south
  at sunset, west by 23:00, below the horizon by 00:30, off until the next
  evening).
- The dome fades in with `Daylight` from civil dusk and is hidden above a
  sun altitude of 2 degrees.

Dusk at 20.5 keeps the atmosphere's orange-to-blue band on the
west-north-west horizon while the first stars appear in the east. Check
the `fire` view at 20.5 and 22.5.

### 3. String lights where the site has them

Replace `BuildLanterns` (globes on sticks) with string lights:

- The internal drives and foot connectors: posts every 12 to 18 m with a
  catenary line between neighbours carrying warm bulbs every 60 cm (one
  instanced bulb mesh, emissive after dusk through custom data), and one
  non-shadow point light per post, 2.5 m radius, warm, dim. About 30
  posts; this is the path lighting campers actually string up.
- The entrance archway: light the unlit string the Structures run wrapped
  around it (find its instance group by name or rebuild the string in your
  folder on the archway's two posts); warm bulbs, one non-shadow light.
- The Vendor Village path lanterns: light the paper lanterns the
  Structures run hung (emissive by custom data; two non-shadow lights at
  most along the path).
- The showcase stage: a line of bulbs along the roof edge and two small
  warm lights under the roof, on after dusk; nothing coloured (the Jam run
  adds stage colour if the music answer calls for it).
- Camp hub string lights: none here; the CampLife run places unlit bulbs in
  wave 3 and the Night 2 reserve lights them.

Budget: no shadow-casting lights; at most 24 non-shadow lights visible in
any night view; radii small; everything emissive where the look allows.

### 4. Tents lit from inside (if time allows)

A two-sided emissive term on the tent fabric through a material instance in
your folder, hashed per tent so about a third glow warm between 21:30 and
00:30 with a slow flicker, no lights. If the tent material does not expose
a parameter, skip and say so.

## Review

Views and hours (BEFORE and AFTER, same order, back to back):

- `fire` 22.5 (your sky and exposure over whatever the fire field holds;
  do not judge the fire), `fire` 20.5, `camp` 22.5, `overview` 22.5,
  `gate` 22.5 (the check-in canopy and the loop's string lights), `fire`
  16.0 and `camp` 17.5 (unchanged apart from noise).

Walk it: `-Review camp -Explore` at 23.0 and look up; walk the drive under
the string lights.

## Done when

- At 22:30 the sky shows the spring stars with the Dipper in the north and
  a first-quarter moon in the west; at 20:30 the western horizon still
  holds colour; at 02:00 the Milky Way climbs in the east.
- The night is dark but readable: canopies no longer glow, the far tree
  line is a silhouette, shadows nearly black, the moon-lit grass dim.
- The drives are lit by strings of bulbs, not globes; the archway and the
  vendor path glow warm; nothing else on the site is lit by you.
- A 16:00 capture is unchanged apart from noise.
- All existing tests pass; your test file passes (sidereal rotation, moon
  path, the night lerps returning daytime values at `Daylight` 1).
- Frame time at `camp` 22.5 and `overview` 22.5 within +1.0 ms of BEFORE.

## Judgement calls to record

The exposure range you settled on and how you checked the day; the star
catalogue you pinned; how you found and lit the Structures run's strings;
light counts per view; anything in step 4 you skipped.
