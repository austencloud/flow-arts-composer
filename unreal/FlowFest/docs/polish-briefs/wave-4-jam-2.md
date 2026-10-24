# Wave 4, run J: Jam, second pass: passing, fire clubs, the live engine

Workstream `Jam2`. Folder `/Game/FlowFest/Assets/Jam2/`, prefix `M_Jam2_`,
new source files `FlowFestJam2.h`, `FlowFestJam2.cpp`,
`FlowFestJam2Tests.cpp`. Inherits the Jam run's and the Juggling run's
ownership once both have merged. Austen's words set its target:

"we can have a variety of juggling happening at this festival. We can have
jugglers hanging out with flow artists. And juggling while they spin. We
can have fire jugglers in the center of the circle. We can have people
passing in the center of the circle."

## Answers from Austen (filled in before launch)

- Q2 props: DEFAULT jugglers one in eight inside, two or three fire clubs.
- Q6 jugglers: DEFAULT passing pair outside the rope on the tent side; two
  to four jugglers inside with fire clubs; some juggling beside a spinner.

## Why this run matters

After wave 2 the circle has solo jugglers from the bake and no passing, no
fire clubs, and patterns fixed at three heights and one tempo. This run
puts passing inside the circle, lights the clubs, pairs jugglers with
spinners, and replaces the bake with a live port of Austen's engine so any
tempo, distance, height and pattern plays, with the bake kept as the
parity oracle.

## You own

The Juggling run's files and `Content/Data/juggling/`; the Jam run's
performer logic for jugglers; the club prop's effect finishes through the
prop component's existing `SetFinish` path (not the component's source;
if a club needs a flame that the prop component cannot give, use your own
small Niagara system per lit club, capped at 8 lit clubs); the juggling
tent's daytime group.

## Build this, in this order

1. The live engine: port `passing-scene.ts` (536 lines; beat scheduling,
   hand loops, ballistic flight, spin, the 18 pattern tables) and the JIF
   animator's siteswap path into `FlowFestJuggling*.cpp` as pure functions
   in Unreal units. Parity test: for every baked pattern and height, sample
   the port at the bake's frames and assert hand positions within 1 cm and
   club positions within 2 cm; the bake stays in the repo as the oracle.
   Then the component takes bpm, distance, height and pattern live.
   Austen's packages only; never `E:/jugglinglab` or `E:/_CLONED/passist`.
2. Passing inside the circle: one or two pairs (4-count, 3-count,
   ultimate) and, when the count allows, a three-person feed, placed by the
   Jam run's motion model as a group that holds its spacing and drifts
   slowly together; the rope repulsion applies to the group's hull.
3. Fire clubs: after dusk the inside jugglers' clubs get the fire finish
   (flame at the knob end, a short trail through the prop component's
   effect path or your own emitter), with the lit-count cap shared with the
   Jam run's 18 lit props; a dip at the dip station between sets, like the
   spinners.
4. Juggling beside a spinner: pair a solo juggler with a poi or hoop
   spinner at 2.5 m, facing each other, for one set at a time; the
   spinner's routine is the captured clip, the juggler's the live engine.
5. The juggling tent by day: a ring of four at the tent (four-count ring)
   and two solos; patterns change through the day by hash.

## Review

`fire` 22.5 and 23.5 (passing and fire clubs inside), `-Showcase juggling`
at 17.0 (the ring), and `-Review fire -Explore` standing by the passing
pair at 22.5.

## Done when

The parity test passes for every pattern; passing happens inside the
circle at night and at the tent by day; fire clubs read with no more than
8 lit at once; a juggler and a spinner work side by side; tests pass;
frame time at `fire` 22.5 within +1.5 ms of the post-wave-2 number.

## Judgement calls to record

Port deviations from the TypeScript; parity tolerances actually reached;
how clubs were lit; group motion constants.
