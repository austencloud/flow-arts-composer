# The Root Terrace regrade

**Date:** 2026-09-08
**Scene:** `earth-root-terrace` (`cave-earth`)
**Supersedes the spatial half of:** `2026-09-07-earth-production-decision.md`
**Status:** implemented in the layout, tests and Blender contract. The Blender
build scripts, the graybox and the production GLB still carry the old room and
have not been rebuilt.

## Why the room changed

Austen walked the shipped slice and said the performers "are down low but you
can't really walk up to them, you can't really interact with them." He was
right, and the numbers say why. The room put the visitor on a terrace 2.8 m
above the door datum, looking at a rootbed at −2.4: a 5.2 m drop, with no way
down by design. Reconstructing that geometry against the case positions — the
terrace at +2.8 with its rail line 0.6 m in from the bed's north face, which is
the arrangement the sightline test now measures against — every case read at
**9.35 m and 35.6° below the horizon**, and from the single ensemble eye on the
old landing the spread ran 12° at the near case to 47° at the far one.

Those are diorama numbers. You look *at* a diorama; the whole point of this
wing is that you look *with* the performer.

The acceptance criterion the regrade is built to, now executable in
`tests/unit/museum/earth-root-terrace-sightlines.test.ts`:

> From the place the room asks you to stand and work a case, that case is no
> further than **6.00 m**, no steeper than **25°** below the horizon, and
> nothing in the room crosses the line to its feet.

## The constraint that shaped the answer

The museum terrain is **2.5D**: one height per (x, z). Stacked decks are not
representable, so nothing can pass under anything. On top of that, the step
rule in the terrain tests flags any 4-neighbour tile pair differing by more
than 0.6 m, which means two decks at different heights need at least 1.0 m of
blocked rock between them in plan.

That kills the obvious fix. A descent that leaves the vestibule on the north
side has to flank the entry ramp, and there is no corridor wide enough to hold
both plus a metre of rock. So the climb stops being a route and becomes a
**dead-end spur**, and the working route leaves the vestibule's *south* face
instead — dropping 1.00 m to a catwalk rather than 2.80 m to nothing.

## The room as built

All figures are plan offsets in metres from the Earth bay's north-west corner
(world `x − 94.25`, `z − 11.25`). Datums are metres above the door.

### Datums

| datum      | height |
| ---------- | ------ |
| overlook   | +1.80  |
| door       |  0.00  |
| gallery    | −1.00  |
| landing    | −1.20  |
| rootbed    | −2.40  |
| cleft      | −6.50  |

### Decks

| deck              | x            | z             | height          | grade |
| ----------------- | ------------ | ------------- | --------------- | ----- |
| vestibule         | 0 – 6        | 2 – 16.5      | 0               | flat  |
| entry ramp        | 6 – 16       | 2 – 6         | 0 → +1.8        | 10.2° |
| overlook (spur)   | 16 – 22      | 2 – 6         | +1.8            | flat  |
| gallery descent   | 6 – 10       | 8 – 9.5       | 0 → −1.0        | 14.0° |
| gallery (catwalk) | 10 – 30      | 8 – 9.5       | −1.0            | flat  |
| alcove G          | 11.5 – 14.5  | 7 – 8         | −1.0            | flat  |
| alcove H          | 18.5 – 21.5  | 7 – 8         | −1.0            | flat  |
| alcove I          | 25.5 – 28.5  | 7 – 8         | −1.0            | flat  |
| east link         | 30 – 33.5    | 8 – 12        | −1.0 → −1.2     | 2.9°  |
| landing           | 30 – 33.5    | 12 – 14.5     | −1.2            | flat  |
| exit ramp         | 30 – 33.5    | 14.5 – 20     | −1.2 → 0        | 12.3° |
| door approach     | 30 – 33.5    | 20 – 24       | 0               | flat  |

The rootbed occupies x 8–30, z 6–20 at −2.4. The catwalk and its three alcoves
are **cantilevered over** that rect — in a 2.5D program the bed is simply the
height the terrain answers wherever no deck covers it, so being inside the bed
in plan is expected. What must never happen is standing *on* it, and the
traversal test asserts every sampled footfall clears the bed by ≥1.2 m.

### The route

West door → vestibule → **entry ramp** up to the overlook → back down through
the vestibule → **gallery descent** → catwalk, stopping at consoles G, H and I
→ east link → ensemble landing → exit ramp → south door to Air.

The walk back out of the spur is the design, not an oversight: the overlook is
the reveal, the catwalk is the work, and the 2.5D constraint above is why they
cannot be one continuous loop.

### The consoles

Three control panels set into the catwalk's south rail, each opposite its own
case. Cap at −1.0 + 1.0 = **0.00**, 1.6 m wide, set back 0.45 m; the visitor
stands at z 9.05 with the case at z 13.

| stand      | case       | plan   | line of sight | below the horizon |
| ---------- | ---------- | ------ | ------------- | ----------------- |
| (13, 9.05) | G (13, 13) | 3.95 m | **4.28 m**    | **22.7°**         |
| (20, 9.05) | H (20, 13) | 3.95 m | **4.28 m**    | **22.7°**         |
| (27, 9.05) | I (27, 13) | 3.95 m | **4.28 m**    | **22.7°**         |

Against the criterion of ≤6.00 m and ≤25°: passes on both, with the foot line
clear over the console's own rail by 0.258 m.

### The other two viewpoints

From the overlook at +1.8, eye (17.0, 5.5): G 9.59 m / 27.6°, H 9.22 m / 28.9°,
I 13.27 m / 19.6°. Deliberately outside the working criterion — this is the
vista, and it is still shallower than the old terrace's 35.6° at every case.

From the ensemble eye on the landing at (30.5, 13.0), −1.2: I 3.79 m / 22.5°,
H 10.60 m / 7.9°, G 17.56 m / 4.7°. The old room's spread was 12°–47°; this is
4.7°–22.5°, which is why the ensemble camera's FOV drops from 84° to 75°.

### Rails

Four disjoint runs, replacing the old single folded line:

1. the north lane over the bed, (8, 6) → (22, 6)
2. the catwalk's south edge, (8, 9.5) → (30, 9.5)
3. the catwalk's north edge, stepping around each alcove and on to (33.5, 8)
4. the east channel's west face, (30, 9.5) → (30, 23.5)

### Spawn

(1.2, 12), facing east — just inside the west door, both routes ahead. The
isolated-room spawn in `vulcan-cave-floor-plan.ts` derives from the same two
numbers, which fixes `/museum?room=cave-earth` landing the visitor on the
room's centre tile, i.e. in the middle of the rootbed among the performers.

## The collider bug this uncovered

The first catwalk band was z 8.25–9.75. The headless playtest stalled entering
it: `stuck at (100.25, 0.85, 19.50)`.

Root cause: tile centres in this bay land on quarter-metres (`earth.minX` is
94.25), and `MuseumPhysicsProvider` probes `COLLISION_RADIUS = 0.15` at four
cardinal offsets. A deck edge sitting *exactly on* a tile centre leaves that
whole row walkable to the terrain and unstandable to the collider — the terrain
says yes, the capsule is pushed straight back off. Both edges of a 1.5 m band
at 8.25–9.75 have that fault.

Fix: shift the band to **8.0–9.5** and deepen the alcoves to 1.0 m so their
edges land on half-metres too (a second failure at `(106, 18.5)` came from an
alcove edge 0.05 m off a tile centre; `ALCOVE_WIDTH` went 2.6 → 3.0).

Every margin improved as a side effect: overlook foot clearance 0.113 → 0.307 m,
console own-rail clearance 0.235 → 0.258 m.

The whole bug class now has a permanent regression test — for every walkable
tile, all four collider probe points must be unblocked.

## Verification

- `tests/unit/museum/earth-root-terrace-terrain.test.ts` — 20 tests
- `tests/unit/museum/earth-root-terrace-traversal.test.ts` — 10 tests
- `tests/unit/museum/earth-root-terrace-sightlines.test.ts` — 5 tests
- `tests/unit/museum/earth-root-terrace-blender-contract.test.ts`
- Full museum suite: **58 files, 506 tests, all passing**

Verified against the real compiled grid at the real tile phase: 0 rect
overlaps, 0 step-rule offenders, 1038 of 1038 walkable bay tiles reachable from
the west door, no orphan decks.

## What this does not do

- **The Blender build scripts still carve the old room.**
  `build-earth-root-terrace-graybox.py` is written against the floor ids
  `ramp` / `terrace` / `descent-a` / `descent-b`, one folded rail line, and the
  old QA cameras. It now fails immediately with a message naming the regrade
  rather than part-way through on a `KeyError`. Re-authoring the carve is scene
  gate 2 work. `build-earth-root-terrace-production.py` already refuses any
  graybox blend whose digest differs from the manifest, so it stops cleanly.
- **The shipped GLB is the old room.** The runtime will keep loading it until
  the graybox and production builds are re-run.
- **The consoles are geometry in the contract, not an interaction.** Nothing
  reads or writes a sequence through them yet.
- **The Blender manifest digest changed** to
  `f756a2b11bee0aa08ce5999c81d4023586245e421638c818daff98bc5d348438`
  (was `a0e76c90…`), which is what makes the two stale builds refuse to run.

## Corrections to the published plan sheet

The rev B artifact presented before implementation has two wrong figures:

1. The ensemble eye is at plan **x 30.5**, not 31.0. Both sightline tables'
   ensemble rows are computed from the wrong x.
2. The console read shipped at **4.28 m / 22.7°**, not 4.05 m / 24.0° — the
   collider fix moved the catwalk 0.25 m north after the sheet was published.
