# Wave 6, reserve: Friday morning, night 2, crowd 2, fixes

Runs only if time remains after wave 5. The coordinator writes the final
briefs; these fix their shape and ownership.

## Run P: Friday morning

Workstream `Morning`. Folder `/Game/FlowFest/Assets/Morning/`. May edit the
morning hours (05:00 to 10:00) of the LightAir run's `ApplyTimeOfDay` and
the morning gains of the soundscape.

A mid-May dawn after a fire jam: sunrise 06:25 with a cold start (about
8 degrees C), dew on everything, the LightAir mist in the hollows, long
pink light across the tents. The fire field at 06:30 is the rope still on
the grass, the safety chairs still in their ring with towels on them, the
dip station packed into its bucket, wagons left, a blanket or two, and no
ash ring, because there was no bonfire. A few people up with mugs; most
tents shut. Build: a wet-look term (specular up, roughness down) on grass,
tent fabric and car paint from 05:30 to 08:30 through parameters those
materials already expose; the leftovers scatter at the circle and the hubs
from 23:00 to 10:00; five to eight early risers with a mug; a `-Review
dawn` preset in `launch.ps1` framing the sunrise over the lower camp from
the upper tree line, east. Review `camp` 6.5, `fire` 6.5, `overview` 7.0,
`gate` 7.0, `dawn` 6.4.

## Run Q: Night, second pass

Workstream `Night2`. Inherits the Night run's ownership.

The small light a campground makes for itself: the CampLife run's unlit
hub bulbs lit (emissive after dusk; one non-shadow light at each of the
six hubs nearest the review cameras), tents glowing from inside if the
Night run skipped it, headlamps on a third of the people walking between
21:30 and 01:00 (narrow non-shadow spots, at most 8 lit at once by
distance), LED props tracing lines on the practice lawns, two cool work
lights under the food structure and one at the check-in canopy. Light
budget: 24 non-shadow lights in any view, none shadowed. Review `fire`
22.5 and 23.5, `camp` 22.5, `overview` 22.5, `gate` 22.5.

## Run R: Crowd, second pass

Workstream `Crowd2`. Inherits the Crowd run's ownership.

Conversation groups (twos and threes facing each other at hubs and the
circle edge, Tier A with the idle clips, hashed turn-taking), a procedural
sit for Tier A in the safety chairs and on blankets if the avatar's IK can
hold a pose without a clip (if not, Tier B seated figures stay), people
carrying props between the camps and the circle, and the walk home at
01:00 with headlamps. Review `fire` 22.5, `camp` 20.0 and 22.5.

## Run S: Fixes

Workstream `Fixes`. Whatever the coordinator assigns from the journey
review and the perf pass, file by file, with explicit paths; small commits
named for the item fixed.

## Done when

Each run's own "Done when" holds; frame times stay within the budget the
Perf run set; nothing in the showcase set looks worse.
