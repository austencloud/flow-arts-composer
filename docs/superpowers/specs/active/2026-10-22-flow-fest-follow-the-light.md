---
status: active
value: 4
effort: XL
work_state: in-progress
remaining: Austen reviews the overnight design pass and its flagged material choices; then the Thursday slice is rebuilt around them in both engines.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-23'
---

# Flow Fest: Follow the Light

Design pass, 2026-10-22, overnight, for Austen's ask: "If you were to rethink
this whole Flow Fest idea, and how the interaction patterns go, how would you
make it blow me out of the water? ... start by porting it to Unreal in addition
to everything else." He was asleep, so the material choices below are made
here and flagged for his review.

## What is there now

Both engines play the same scripted Thursday: loadout, drive in, check in,
choose a camp, unload, workshop field, fire jam, sleep. Each step is an
objective line on the HUD and an **E** press. The world under it is strong and
getting stronger (LiDAR terrain, the measured woods, the real structures, the
mid-May season, Austen's juggling engine). The experience on top is a
checklist. The polish program fixes the look and keeps that structure, and its
biggest gap is still the jam: the emotional centre of the festival is a
bonfire that does not exist at the real event.

## Three directions considered

1. **Follow the Light (chosen).** One continuous evening instead of a list.
   Time is the spine: golden hour, blue hour, the jam. No objectives; light,
   sound and people pull you, and the interaction is five verbs that need no
   menu: walk, linger, sit, join, flow. The first slice is the jam at dusk,
   because it is the moment the festival exists for.
2. **The living diorama.** The festival as a tilt-shift miniature you scrub
   through a day, clicking anyone to follow their story. Gorgeous and cheap to
   control, but it makes Austen a spectator of his own festival and throws
   away the third-person body and the arrival arc he asked for.
3. **The road movie.** Make the drive-in arc cinematic end to end, one
   unbroken shot from the cornfields to a pitched tent. True to his "that's
   the whole thing", but the arrival is already built and mostly a matter of
   polish, and it ends where the feeling starts.

Direction 1 wins because it changes the interaction model for the whole game
(every later moment, including the arrival, can use the same verbs) while the
first slice lands the one scene that is currently wrong.

## The interaction model

- **No objective HUD.** The slice shows a small title card that fades, and at
  most one quiet verb hint at the bottom when a verb is available
  ("E sit", "Q flow"). Nothing else on screen.
- **Attention instead of waypoints.** The rope glows as the sun goes; fire
  whooshes and crowd voices are positional; spectators face the circle. You
  go where the light and the noise are.
- **Linger.** Walk slowly within 9 m of the rope and after 2.5 s the camera
  eases lower and wider, framing the circle the way a person standing there
  would look at it.
- **Sit.** E at the edge sits you on the grass among the watchers.
- **Join.** Walk through the entrance gap with your props and they light.
- **Flow.** Q (Unreal) or Space (browser) starts your routine. Keep flowing
  for 6 s and the watchers within 14 m turn to you; keep going for 18 s and a
  performer drifts over and mirrors you, in step. Stop and attention drifts
  back to the circle.

All the numbers live in one place, the `interaction` block of the shared
layout, so the two engines feel the same.

## The slice: Dusk at Middle Earth

1. **The opening (36 s).** A camera high on the north-west rise over the dip
   station at golden hour, sun at 9 degrees, descending along the walk as the
   sun goes to 7 degrees below the horizon and the rope comes on, ending behind
   the archway at eye height with the lighting flame framed in it. Any key skips. The keys carry sun elevations, not
   clock hours, so the shot survives the Season run's clock change.
2. **The night builds.** Control hands over outside the entrance. Performers
   step in by the night curve (full at 22:30): fire inside the rope, LED
   spinners loitering outside, watchers filling the edge, the DJ's beat from
   the stage.
3. **The jam.** Free play with the five verbs.
4. **Watch mode.** The same opening, then a slow orbit of the jam, for a
   video capture and for showing someone.

## One layout, two engines

`src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts` lays out the
rope, the walk from the dip through the funnel and the archway to the lighting
flame, 16 safety stations, about 100 edge pieces, 68 spectator spots, 16 fire
spinners inside, 18 LED spinners outside, the DJ booth, the stage string
lights, the opening shot, the night curve, the light and the interaction
numbers. The browser imports it; `unreal/FlowFest/Tools/export-jam.ts` writes
it to `Content/FlowFest/Assets/Jam/Data/jam-layout.json` for Unreal. Tests in
`tests/unit/flow-fest-jam-layout.test.ts` hold the promises the eye cannot
check from one capture: closed and simple, clear of every footprint and the
walk, stations facing in, nothing on the entrance or the funnel, fire inside
and LED outside, about a third of the crowd performing.

The rope is Thursday's 35 by 25 m ellipse bent by slow hashed noise, bulged
toward the stage, and pulled in wherever it would run over a canopy or the
walk. It keeps the full-size rope's north-west end, so its gap opens about
four metres past the archway.

## Austen's answers (round 2, 2026-10-21) and how the slice uses them

1. Smaller Thursday rope, about 35 by 25 m: the layout's size.
2. "A third of the people are performing at any given time", fire inside, LED
   spinners "around the edge of the circle in the open areas and under the
   structures and next to the vendors and next to the DJ booth": 16 fire
   spinners inside (the frame cap is 18), 18 LED spinners outside anchored
   under the four workshop canopies and the juggling tent, by the food
   pavilion, around the DJ booth and on open grass, and 68 watchers: 34 of 102
   perform.
3. Dip, then a funnel to the archway, then the lighting flame just inside the
   field: two low funnel lines run from just past the dip through the archway
   to the gap posts, and one flame stands 1.8 m inside the gap. Safety stations
   are a chair and a towel, no flame. The interview's second wait (A1, A2, B2)
   is left out; his newer description has none. **Review:** if that second
   wait is still real, the walk gets it back in one place.
4. A few warm string lights: two runs on the stage, across its front and down
   to the booth. The Vendor Village path is outside Middle Earth and waits for
   the slice that walks it.
5. DJ booth at the stage edge facing the circle, a steady beat until 02:00:
   the booth stands off the stage's centre line. **Choice made here:** the beat
   is synthesized in the engine (kick, hat, a low pad at 118 BPM), not a song
   and not AI music. A real track would be one Austen picks and licenses.
6. Jugglers everywhere: fire clubs inside at night (3 of the 16), LED vision
   clubs outside (5 of the 18, two of them under the juggling tent). The
   afternoon passing pattern, the tent-side juggling and the workshops belong
   to the daytime slices. A new LED vision club model is authored in Blender
   for both engines.
7. Camping: Crowd scope, not this slice.
8. Middle Earth first: this slice.

The verbs and their keys, the 6 s and 18 s attention thresholds and the 36 s
opening are still first guesses to tune by feel.

## What comes next

- The Vendor Village path's string lights and the daytime juggling (the
  passing pattern mid-field) when those slices are built.
- The same verbs on the arrival: the canopy exchange becomes "linger at the
  table", not a button.
- People you know: returning faces who notice you the way the jam does.
- Fire clubs and passing in the circle (polish Jam 2), the Night and LightAir
  runs for stars, moon and air.
