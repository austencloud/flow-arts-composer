---
status: active
value: null
effort: null
remaining: "Verify The Water Traverse — Design against the current The Water Traverse — Design runtime and acceptance criteria before resuming implementation. Prior recorded remainder: Verify the amended chamber scale and hand path against the current water traverse scene and acceptance views."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# The Water Traverse — Design

**Date:** 2026-08-09
**Status:** Approved (Austen, 2026-08-09: "finish this job without any more gates")
**Amended:** 2026-08-11 — chamber scale (58 m) and the hand path first; see the
amendment section at the end.
**Supersedes:** `2026-08-09-drowned-gallery-channels-design.md` (three channels, air-bells,
buoyant shaft, mirror-pool ensemble)
**Tracker:** amends `DRct0NTn`, `kZfilqc0`, `RGJjXOrk`

## What this is

One walk through water in three states. Ice, then liquid, then steam, staged
across three open landscapes joined by a single watercourse. The visitor walks
one direction and never backtracks.

It is deliberately **outside the museum fiction**. Austen (2026-08-09): *"I'm
kind of considering this experience to be something that'll come long before I
try to make the museum story actually fit."* No Order, no Vulcan Cave, no
diegetic explanation for why a glacier gives way to a seafloor. The piece is
surreal and is allowed to be.

It is also a callback to the app. Winter and Ocean are backgrounds users spin
sequences against every day; walking through them is a homecoming for anyone
who has used the app and a trailer for anyone who has not.

## The spine

**One water surface. Three relationships to it.**

| | Landscape | The visitor is | Letter | Effect |
|---|---|---|---|---|
| 1 | Frozen river across a snowfield | **on top of** the surface | **A** | `sparkles` |
| 2 | Sea trench, walked on the floor | **beneath** it | **B** | `goo` |
| 3 | Geothermal plain | **half in** it | **C** | `smoke` |

On it, under it, in it. The arc resolves by putting the visitor inside the thing
they started out standing on.

### Why those letters

MCP-verified 2026-08-09. A, B and C are the Split-Same group of Type 1
(Dual-Shift).

- **A** is pro / pro. Both hands the same direction, no internal conflict —
  unified and locked. Ice.
- **B** is anti / anti. Also unified, but inverted — the same motion as A at
  the opposite rotation.
- **C** is the hybrid, anti blue / pro red, and the only one of the three
  carrying both. It also has 16 variations where A and B have 8 — the most
  variable letter in the group.

Walk order is **A → B → C** — the alphabet counting up as you go. The first
mapping put the hybrid letter on the liquid leg because liquid is the hybrid
state; a nice idea nobody walking the route could ever read. What a visitor
actually reads is the alphabet in order, so the order wins.

## Wayfinding: the water is the path

The single constraint Austen set on scale: *"as long as the path is clear and
we don't force the user to have to explore in order to figure out where to go."*

The watercourse is both the theme constant and the route. The visitor is never
given a direction; they are given a river.

1. **Snowfield.** A frozen river cuts a distinct ribbon through snow, readable
   to the horizon. The field may be arbitrarily large because the visitor is not
   navigating the field — they are following the ice.
2. **Sea.** The trench the river became. Seafloor channel, current moving with
   the visitor, god rays overhead.
3. **Geothermal plain.** The hot stream, marked out across the plain by its own
   steam.

Glacier to sea to hot spring: one watershed. Iceland is the real landscape that
is all three at once, and is the art-direction reference.

### Hard constraints

- **One path, always visible, never a choice.** If a visitor stops and turns in
  a circle wondering where to go, the design has failed.
- **Forward-only.** No reason to walk back. The river runs one direction.

## All three states are present in all three landscapes

Each landscape is *dominated* by one state, not limited to it — a hot spring in
a cold place is ice at the edges, liquid in the basin, steam at the interface.
Open sightlines deliver this for free:

- From the frozen river, the steam plume of the geothermal plain is visible far
  across the valley. The end of the walk is visible from the beginning.
- From the seafloor, the Snell window shows ice above; hot vents ahead trail
  steam.
- From the geothermal plain the visitor can turn and see the whole way back.

Nothing is staged to say this. Distance says it.

## Transitions

- **Ice → Sea.** A threshold the visitor sees through first: the frozen river
  widens, the ice thins, green light comes up through a crack, and they walk
  down into it.
- **Sea → Steam.** The one expensive moment. The visitor **rises up through the
  surface** into steam. Both environments must be alive for the length of the
  crossing.

Considered and rejected: transitioning *through* every surface (beautiful,
three times the cost), and morphing the world in place around a stationary
visitor (purest, far beyond budget).

## Performers

One per landscape. One body having a different argument with the same substance:
the ice performer is locked in it, the liquid performer moves with it, the steam
performer is dissolving into it.

**No ensemble finale and no fourth space.** Nothing to complete, nothing to
collect, no gate.

## Grammar: traverse, not complete

This walk is linear, and Water's approved grammar was choose-one
(`RGJjXOrk`). The amendment, to be written into the tracker so it is not
relitigated:

> Fire's verb is **complete the set** — three shrines that must be finished
> because extinction causally requires all three. It is a checklist with a gate.
> Water's verb is **traverse a transformation** — one direction through a
> substance that changes state. Nothing unlocks, nothing completes, there is no
> gate. Linear movement is not the same as a procession of tasks.

Earth's half of that ruling (Earth's verb is *compare*) is untouched.

## What survives, what does not

**Survives:** the water optics work of 2026-08-09 —
`primitives/water-surface-shader.ts` and its `PlanarReflector` seams. Fresnel,
depth absorption, ripple normals and foam are exactly what a geothermal pool at
landscape scale needs.

**Does not survive:** the Drowned Gallery basin geometry. Today's grotto pools
are 19×4 m and 19×7.5 m — room-sized. This is not a room.

**Naming:** `primitives/WaterSurface.svelte` collides with
`scenes/ocean/runtime/water/WaterSurface.svelte`. They are different capabilities
— a reflective pool seen from above versus a Gerstner/Snell underside seen from
below — but the two names cannot sit this close together once the ocean scene is
part of this walk. The primitive is renamed `ReflectivePool.svelte`.

## Risks

- **Three heavy environments in one walk.** Winter and Ocean were authored as
  standalone backgrounds with their own budgets. Running them as landscapes in a
  continuous walk needs a load/unload strategy and a real memory measurement
  before any polish.
- **The rise-through-the-surface moment** needs two environments resident at
  once. Prototype it before anything gets pretty; if it does not land, the
  structure needs rethinking.
- **The scenes were not authored as walkable ground.** They are skyboxed
  backgrounds sized to a camera orbit. Making them walkable terrain is not free.

## Build order

1. The walkable route shell and the watercourse path, graybox, all three
   landscapes at true scale. Proves wayfinding and the sightlines.
2. The sea → steam rise. The one transition that can invalidate the structure.
3. Landscape dressing, drawing on the existing Winter and Ocean subsystems.
4. Performers and their effects.

## Amendment — 2026-08-11: chamber scale, and the hand path first

Austen: *"make the 3-element walk much smaller, like the same length as fire
and earth"* — and open Water with the hand path itself, not a performer.

### Chamber scale

The walk is re-authored at **58 m nose to door — exactly the Fire court's
length** — replacing the 170 m version (which itself replaced 284 m). The
shrink lives in the base metres, not the knob: `WORLD_SCALE` is now `1.0` and
grow-only, because a 3× compression is not a scale — the visitor's eye does
not shrink, so every depth, clearance and grade was re-derived against a
full-sized person.

| Region | z | The move |
|---|---|---|
| Snowfield | 0–10 | Hand-path station (z 3.2), then A (z 6.5) |
| Descent | 10–20 | Drop to −5.0, 28° — the head goes under at ~z 13 |
| Sea | 20–27 | Floor −5.0, 3.4 m of water over the eye; B |
| Cave | 27–36 | Flooded tube, roof −2.0 → −1.2 |
| Canyon | 36–41 | 18 m tall × 9 m wide — the look up |
| Sump | 41–48 | Eased closing to a 2.6 m pinch over the deepest floor (−8.8) |
| Springs | 48–58 | Pool at −5.6; eye breaks ~z 51.5, shore ~z 55; C, vents, the door |

Measured (probe, 2026-08-11): 14 s walk at 4.2 m/s, 9 s of it under water
(63%), min headroom over the eye 1.0 m at the pinch, all vents and performers
on their floors. The sump pinch clearance keeps its absolute floor
(`eye + 1.0 m`); the springs pool still drowns the pinch roof by 0.6 m so the
emergence stays real.

The baked seabed relief is **gated off** (empty mesh + collider guard) — its
height field is in old-world coordinates (z 52–190) and would drape phantom
dunes through the springs. `scripts/traverse_seabed.py` re-bakes against the
new sea leg before any art pass turns it back on.

### The hand path first

Water's primitive is the split-same **hand path**, so the room opens by
showing the path — then the A performer embodies it. `handPathStation` is a
layout anchor on the frozen river at z 3.2 (before A at z 6.5): two wheels,
1.2 m radius, 1.7 m apart, inside the 4.4 m ice ribbon.

**The display is staged in dual-wheel mode.** Austen (2026-08-11): split-same
hand paths must be shown as dual wheels — *"don't ask me why it just does.
Unless you do sequences that move back on themselves without arms clipping."*
The recorded mechanism is arm clipping; the exception is sequences that
retrace themselves. Tracker: session `7jVOf8oQz0ldTrCP7Six`, decisions
`a9Faq6kNTkntXWAK2JFI`, `l2vDxYLAFZ5Y7HIUC19C`, `6bfjxuoTFJ3hDyg1URqS`.

How the station is *drawn* (water-etched wheels in the ice vs ghost ribbons
vs a combined progression) is a separate visual decision — the graybox
reserves the anchor and draws nothing.

### The ring stations

Austen (2026-08-11): A, B and C *"each need to have the kind of reverence
that we're giving everything in the other places … you can't walk past them,
you need to either walk around them or interact with them or definitively
see them"* — and he endorsed the ring answer over a full springs-court flip.
Tracker: decision `JqxXbDudCYcHpgfNSIvs` (the rule), decision
`4cmrQvu4BG1wfZhI1Lm3` (the grammar, built same day).

Each performer stands on a dais dead on the centreline, and the path splits
around it and rejoins. The rise is the enforcement, not staging: the
character controller autosteps 0.45 m, and every riser is 0.9 m or more from
every approach, so walking around is physically the only way past. The same
shape three times is what makes it a grammar — by the third ring, walking
around a platform *means* "a letter lives here."

| Station | z | The dais | The ring |
|---|---|---|---|
| A · ice | 6.5 | 2.4 m ice dais, +0.9 over the river | The river widens to a ±4.5 m frozen pool (z 4.5–8.5); 3.3 m ice ring each side, snow rim standing 0.28 proud |
| B · sea | 23.5 | Trench dais, +0.9 over the sea floor | Guide stones from x ±4.2 to the walls force two 3 m lanes; from the descent you see over the stones to the dais they frame |
| C · steam | 55.0 | Vent dais straddling the shoreline, top 1.2 m over the pool | Waded around in the shallows right after the surface break; the still pool doubles the figure — reverence, the mirror, and dwell in one move |

C's old placement (x −3.4, "something you pass") is deleted — being passed
at walking speed is the exact thing the reverence rule overrules. C's ring
is also the seed the springs court can grow from if the room later earns the
full flip (proposal `zzt034TIkGGMV61ZP1zU`, deferred; mirror proposal
`gp0dpD1lamWswoZue9vt`, absorbed).

Blue in the graybox still means "where the visitor stops": the stop disc now
lies at the *ring* floor around each dais (`PerformerAnchor.ringY`), while
the body post stands on the dais top — the two are different numbers now,
and the markers say so.
