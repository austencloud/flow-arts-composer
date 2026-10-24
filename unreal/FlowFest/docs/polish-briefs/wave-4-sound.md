# Wave 4, run L: The sound of a May festival

Workstream `Sound`. Folder `/Game/FlowFest/Audio/Polish/`, new source files
`FlowFestSound.h`, `FlowFestSound.cpp`, `FlowFestSoundTests.cpp`. Owns
`FlowFestSoundscapeComponent.cpp/.h`, `Tools/prepare-audio.py` and
`Tools/import-audio.py`. Starts after wave 3 merges; question 5 sets the
music.

## Answers from Austen (filled in before launch)

- Q5 music: DEFAULT a DJ at the stage edge, a steady electronic beat across
  Middle Earth, bass felt from the camps, until about 02:00.

## Why this run matters

Six synthesised loops cover wind, birds, insects, camp, crowd and fire. On
foot the festival is quiet, and what there is belongs to August: crickets
and katydids. Mid-May in south-west Ohio sounds different: a dawn chorus
that starts at 05:30 (robins, cardinals, wood thrush in the woods), spring
peepers and American toads trilling from the damp sedge and the drainage
after dusk, few crickets, no katydids, wind in new leaves, and at night the
beat from the stage, the whoosh of fire props, cheers when a set ends,
voices at the camps, a generator behind the food structure.

## Build this, in this order

All sound is synthesised in `prepare-audio.py` as the existing loops are:
no downloads, no samples, deterministic, loop-seamless, mono, a report
line per file.

1. The May bed: replace the night insect loop with spring peepers (a chorus
   of short rising chirps around 3 kHz, dense from the sedge, thinning
   with distance) and toad trills (a 20 Hz pulsed tone for 10 to 20 s),
   from 20:30 to 03:00, spatialised at the damp ground; a dawn chorus loop
   from 05:30 to 08:00 at the woods edges; wind in leaves by day.
2. The circle: fire-prop whoosh loops (filtered noise swept with the
   spin, a few variants) attached to lit props near the listener, the
   dip-station bucket hiss; cheers and whistles from the edge crowd when a
   performer's set ends (hook the Jam run's set change).
3. Music by Q5: a synthesised four-on-the-floor set at 124 bpm with a
   filtered bass line and a slow filter sweep, from the stage's speakers
   from 21:00 to 02:00, attenuated across Middle Earth, bass-only from the
   camps; or a drum-circle pattern if the answer says so.
4. Camps and the loop: low voices at hubs, a tent zip, gravel under tyres
   and a car door at the check-in queue, the generator hum behind the food
   structure.
5. Mix: ducking under the music and fire at the circle; the `M` toggle
   silences all; gains by the Season run's hours.

## Review

On foot: `-Review fire -Explore` at 22.5 and `-Review camp -Explore` at
20.0 and 6.5; describe the mix in the report with per-voice gains. Tests
cover loop seams and the gain curves by hour.

## Done when

Night has peepers, not katydids; dawn has a chorus; the circle has props,
music and a crowd; camps murmur; no clicks at seams; `M` silences all;
tests pass.
