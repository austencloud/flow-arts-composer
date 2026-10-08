---
status: active
value: null
effort: null
remaining: "Recheck built trench gallery composition against current asset placement and the documented proof views."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: verification
---
# Trench Gallery Composition — Design

**Queue evidence (2026-10-07):** The recorded 2026-08-09 build needs current placement and proof-view verification before completion.

**Original status (historical):** built 2026-08-09
**Scene:** the water traverse's middle leg (`/test/water-traverse`, z 92–190)
**Consumes:** `scripts/ocean-asset-facts.json`, `scripts/ocean-ecology-rules.json`
**Related:** `docs/superpowers/specs/active/2026-08-09-ocean-composition-matrix-design.md`
(the asset index this is built on)

## The problem

The trench shipped with one baked reef GLB dropped at its centre. It is a 40 m
island in a 98 m room: bare sand on the approach, bare sand past it, and the
island itself composed for a different scene entirely. The walk spends about
seventy seconds down there and for most of them there is nothing beside you.

The asset index built the same day makes the fix affordable — 47 assets with
researched species scale, silhouette class, footprint and facing, plus ecology
rules for how each class groups. What did not exist was any statement of how a
reef should be arranged for someone *walking through it*.

## Why this is not the ocean composer

`scripts/generate-ocean-composition.py` composes a theatre: elliptical zones
around a proscenium and a dais, sampled against a baked 256×256 heightmap,
staged for one hero camera sitting downstage. Every one of those assumptions is
false in the trench.

| | Ocean stage | Trench gallery |
|---|---|---|
| Audience | one fixed hero camera | a person walking the centreline |
| Floor | sculpted shelf, needs a baked heightmap | a flat and two ramps, closed-form arithmetic |
| Composition unit | zone ellipse around a focal point | act along z, band across x |
| Failure mode | a pinnacle in front of the performer | anything at all in the walking channel |

The two share their **data** — the facts index and the ecology rules are
consumed verbatim, with no second copy of any species measurement — and share
nothing else. Parameterising a hero camera into a thing that has no camera
would have been the more expensive answer.

## The grammar

### Bands: distance from the walk decides size

The central move, and the thing that makes this read as an exhibit rather than
a reef.

| Band | Distance from centreline | Admits | Substrate |
|---|---|---|---|
| near | 7–13 m | 0.08–2.2 m | sand |
| mid | 13–23 m | 1–5 m | reef |
| far | 23–35 m | 4–12 m | rock |

A reef does not sort itself by size relative to a walkway. A curator does.

It also generalises a lesson the fish already taught this scene: 87 reef fish
spread across a 78 m disc were a few pixels each and read as nothing. Something
40 cm across at 30 m in fog is not small, it is *absent*. So nothing small is
ever placed out in the far band where it cannot be seen, and nothing monumental
is placed close enough to become a wall.

Substrate falls out of the same three bands rather than being painted: the
swept sand apron beside the walk, the reef bed, the rocky rubble running up to
the ridge. The first run derived substrate the other way — flat sand
everywhere, rock only at the walls — and locked every hard coral in the index
out of the trench, because reef-substrate species had nowhere to live but a 4 m
strip 30 m from anyone looking at them.

### Acts: three movements along the walk

- **Descent beds** (z 92–116) — nothing over 3 m. You have just come down a
  40 m ramp into a room that is about to be enormous; holding the ceiling low
  here is what makes the next act land as a reveal.
- **Colonnade** (z 116–162) — the monumental band, openly architectural.
  Pinnacles, buttress walls and bommies ranked into bays at an 11.5 m stride,
  alternating flanks so the view down the trench never closes.
- **Shallows approach** (z 162–190) — thinning, rising toward the light. The
  last 15 m is bare sand: the visitor's head breaking the surface is the moment
  this leg is built around and it does not share the frame with scenery.

### The three curated moves

**Gates.** Two arches straddle the centreline, scaled so the opening clears the
channel, squared to the walk so they are passed *through*. Standing inside the
exhibit rather than beside it is the strongest move a walkable room has, and
four arch assets were sitting unused in the index.

**Specimens.** Four assets stand alone on a cleared apron at reading distance:
a table coral, a wrecked hull, a brain coral, a sea fan. Deliberately not
ecological — a museum shows one perfect example of a thing in its own space and
a reef never does. They are placed before the scatter so it routes around them.

**Kelp stands.** Giant kelp is the only asset that reaches from the seabed
toward the surface, so it is the only one that can describe the 18 m of water
overhead. Five dense stands, not scattered singles: kelp is a forest or it is a
weed.

### Yaw

The ecology rules' `face-camera-biased` policy aims at the ocean stage's fixed
hero camera. There is none here, so it is reinterpreted: the audience is the
walking line, and an instance turns to face the nearest point on x = 0. Same
intent, different geometry.

### Clearance

Non-negotiable, and the reason the walk stays legible without exploration:
nothing is placed within `channelHalfWidth + 2.5 m`, measured to the instance's
own **footprint** rather than its origin. A 12 m pinnacle whose centre clears
the channel still hangs six metres of rock over it.

## The pipeline

```
scripts/water-traverse-reef-layout.json   the art layer — edit this when a frame looks wrong
  + ocean-asset-facts.json                the researched index (shared, read-only)
  + ocean-ecology-rules.json              the biology (shared, read-only)
        │
        ├─ generate-traverse-reef.py   → scripts/water-traverse-reef.json   (513 placements, 37 assets)
        ├─ prepare-traverse-reef-sources.mjs → .cache/traverse-reef-src/    (Blender cannot read meshopt)
        ├─ build-traverse-reef.py      → static/models/water-traverse/trench-reef_raw.glb
        └─ optimize-ocean-glb.mjs <in> <out> → static/models/water-traverse/trench-reef.glb
```

Baked rather than runtime-instanced, per `.claude/rules/blender-first-3d-scenes.md`.
The runtime cost argues the same way: 37 separate fetches and decode stalls
during a walk, against one file with shared mesh data.

`optimize-ocean-glb.mjs` was **extended**, not forked — it now takes optional
input/output arguments and defaults to the ocean scene. Its five passes encode
hard ordering constraints between KTX-Software and meshopt that must not exist
in two places.

## Two traps this build hit, recorded so the next one does not

**`export_apply=True` destroys instancing.** It evaluates every object to its
own mesh, so 510 linked duplicates exported as 510 unique meshes and a 494 MB
file. There are no modifiers here to apply; it is pure cost.

**Blender cannot open `EXT_meshopt_compression`.** Several ocean assets ship
with it and the importer refuses them outright. Sources are round-tripped
through `gltf-transform copy` into a disposable cache first.

## How this is proven

By walking it. Frames from the trench entry, both gates, the colonnade at eye
level and the surface break — not a placement count, and not a green typecheck.
The generator's per-band summary reports how many instances gave up against the
spacing rules, which is the signal that a band's width and its clearance
disagree.
