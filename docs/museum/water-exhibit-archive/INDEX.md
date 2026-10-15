# The Water Exhibit — everything we have tried, in one place

Assembled 2026-08-11, at Austen's instruction, immediately after the Water
Grotto graybox was rejected: *"consolidate every attempt thus far through git
and local files and put them all in one place so that we can say here's the
pile of everything we've tried thus far for the water exhibit, then we can use
that as a reference to figure out what went right what went wrong what to keep
what to throw away before we completely start fresh."*

This file is **the pile**. It is not a design and it does not propose one. It
catalogues five attempts, what each was, what it cost, why it died, and what
survives that a sixth attempt should take with it.

Nothing here is deleted. Live files are linked in place; files that were
removed from the tree are recovered under `recovered/`.

## The pile at a glance

| # | Attempt | Dates | Verdict |
|---|---|---|---|
| 1 | Drowned Gallery — sump, corridor, grotto | 08-02 → 08-03 | Gate 2 never passed; traversal bug; superseded |
| 2 | Drowned Gallery "Ring" v2 — flooded gallery | 08-03 | Superseded, then reinstated as the fallback |
| 3 | Drowned Gallery Three Channels | 08-09 | **Reverted the same day** (`df0d7548ed`) |
| 4 | Water Traverse | 08-09 → 08-10 | Abandoned 08-11 — a corridor, not a room |
| 5 | Water Grotto | 08-11 | **Rejected on sight** — performers under the mirror |

**Total spend on the shelf:** 170 commits touching water paths, ~9,000 lines of
live water-specific code, and ~460 MB of models (`trench-reef_raw.glb` alone is
432 MB, its optimized form 29 MB). Five graybox geometries. Not one of them was
ever walked and approved.

---

## 1 · Drowned Gallery — sump, corridor, grotto (08-02 → 08-03)

The original Vulcan Cave water room. You entered through a sump, walked a
carved corridor, and arrived in a grotto with a waterfall and a mirror pool.

- Spec: [vulcan-cave-water-room-drowned-gallery-design.md](../../superpowers/specs/backlog/2026-08-02-vulcan-cave-water-room-drowned-gallery-design.md)
- Plan: [drowned-gallery-graybox.md](../../superpowers/plans/backlog/2026-08-02-drowned-gallery-graybox.md)
- Plan sketch: [2026-08-02-drowned-gallery-plan.html](../../../static/sketches/2026-08-02-drowned-gallery-plan.html)
- Playtest: [drowned-gallery-playtest-report.md](../../superpowers/specs/2026-08-02-drowned-gallery-playtest-report.md)
- Cold reviews: [Opus](../../superpowers/specs/2026-08-02-drowned-gallery-cold-review-opus.md) · [Codex](../../superpowers/specs/2026-08-02-drowned-gallery-cold-review-codex.md)
- Aesthetic push: [aesthetic-push-plan.md](../../superpowers/specs/2026-08-02-drowned-gallery-aesthetic-push-plan.md)
- Handoff, gate NOT passed: [graybox-handoff.md](../../superpowers/specs/2026-08-02-drowned-gallery-graybox-handoff.md)
- Key commits: `c42e226cd8` (handoff — traversal bug open, gate not passed),
  `25f0d341e9` (render the real carved shape), `cf707da460`, `2dbb22a75e`,
  `bba23387f0` (19-performer roster resolved), `4ef0088d95` (cold reviews)

**Why it died:** a traversal bug through the sump→grotto corridor was never
closed, and the cold reviews landed at the same time as a flow rethink. It was
abandoned mid-gate rather than rejected on its merits.

**What it got right:** the grotto's mirror pool. This is the only attempt in
which the visitor ever stood *above still water and looked at a reflection*, and
every later attempt lost it.

## 2 · Drowned Gallery "Ring" v2 — flooded gallery (08-03)

Replaced the sump with a flooded gallery you circled.

- Design: [ring-flow-design.md](../../superpowers/specs/2026-08-03-drowned-gallery-ring-flow-design.md)
- Plan: [ring-graybox.md](../../superpowers/plans/2026-08-03-drowned-gallery-ring-graybox.md)
- Sketch: [2026-08-03-drowned-gallery-ring-plan.html](../../../static/sketches/2026-08-03-drowned-gallery-ring-plan.html)
- Commits: `df52cef9bf` (Ring graybox v2), `8910031d0f`, `56e5d337f9` (ledger closed)

**Why it matters:** the Ring is the only shape in the pile that is a **loop
around a body of water** rather than a line through one. When Three Channels was
reverted, the tree went back to this.

## 3 · Drowned Gallery Three Channels (08-09) — reverted

Three parallel channels with bells and a buoyant shaft. Ran the full gate
process — Gate 0 evidence, spec, Gate 1 measured plan, Gate 1 *approved*, Gate 2
graybox built — and was then reverted the same day.

- Gate 0 evidence: `330bdd317a` · Spec: [channels-design.md](../../superpowers/specs/2026-08-09-drowned-gallery-channels-design.md)
- Gate 1 plan: `506841743e` · Gate 1 approved: `f43a1602d1` · Gate 2 graybox: `03957a67b8`
- **Revert: `df0d7548ed`** — "three channels rejected"
- Blender plan JSON: [drowned-gallery-blender-plan.json](../../superpowers/specs/2026-08-09-drowned-gallery-blender-plan.json)
- Production contract: [drowned-gallery-production-contract.md](../../superpowers/specs/drowned-gallery/drowned-gallery-production-contract.md) · [scene-gates.json](../../superpowers/specs/drowned-gallery/scene-gates.json)
- **Recovered from the revert:** [gate1 board SVG](recovered/three-channels-gate1-board.svg) · [gate1 report JSON](recovered/three-channels-gate1-report.json) · [board generator](recovered/generate-drowned-gallery-board.ts)

**The important lesson:** this attempt passed a formal Gate 1 approval and was
still rejected once it existed in three dimensions. A measured floor plan that
validates is not evidence that a room is good.

**Technical wins from this window, all still live:**
- `cacfc76e2e` real planar reflection on grotto water
- `4ddb53671a` water optics for the grotto, "not a mirror in the floor"
- `1ecc075b86` dev-only review bridge (the ancestor of every `__grotto`/`__traverse` bridge since)
- `be535c587c` sweep water basins for reachability instead of guessing fences
- `3b946cfae1` Blender graybox + walkable review route

## 4 · Water Traverse (08-09 → 08-10)

One continuous walk through ice → sea → springs. Started at 372 m, was
compressed repeatedly, and ended as a 56.5 m ribbon.

The compression history is the story:
- `109d9f7947` the Water Traverse — one **372 m** walk through ice, sea and steam
- `70230bdfdc` compress to **244 m**, order the performers A-B-C
- `f9f43bdfdd` put it back indoors as three chambers of a hall
- `7b77f90a27` the trench comes alive — reef, shafts, fauna
- `9aed63f48d` the trench becomes a gallery — **712 specimens down 98 m of seabed**
- `1226094a51` / `092001dd1d` sculpted seabed and a cleared route
- `957a80810d` surface at the colonnade
- `318a11ec59` **strip the traverse back to a graybox you can actually walk**
- `34596b1314` trench opens into a cave, cave into a canyon
- `090897d00d` the far end was a wall, so make it a door
- `1c608b0711` make the springs a spring — go down, come back up
- `8c0609ffd9` one descent, one rise, and the rise is the ending
- `5840ed8ab2` one world-scale factor, graybox starts small

Live code: [water-traverse-terrain.ts](../../../src/lib/features/water-traverse/data/water-traverse-terrain.ts) ·
[water-traverse-seabed.ts](../../../src/lib/features/water-traverse/data/water-traverse-seabed.ts) ·
[water-traverse-atmosphere.ts](../../../src/lib/features/water-traverse/data/water-traverse-atmosphere.ts) ·
components `TrenchFloor` `TrenchGallery` `SeaChamberLife` `SteamColumn` `TraverseSky` ·
route [test/water-traverse](../../../src/routes/test/water-traverse/+page.svelte)

Design doc (modified, uncommitted): [2026-08-09-water-traverse-design.md](../../superpowers/specs/active/2026-08-09-water-traverse-design.md)
Sketches: [floor map](../../../static/sketches/2026-08-10-water-traverse-floor-map.html) ·
[birds eye](../../../static/sketches/2026-08-11-water-birds-eye.html) ·
[reverence stations](../../../static/sketches/2026-08-11-water-reverence-stations.html) ·
[UX weighing](../../../static/sketches/2026-08-11-water-ux-weighing.html)

Assets: `trench-floor.glb` 156 KB, `trench-reef.glb` **29 MB**, `trench-reef_raw.glb` **432 MB**

**Why it died (Austen, 2026-08-11):** *"they've tried to pack too many things in
too much of a confined space… the user doesn't have time to stop and look at
what they're looking at… just look at this passageway underwater, you tell me
I'm supposed to notice this thing, appreciate it, have space and feel like it's
being treated with reverence, and then walk around it."* 1,155 m² of floor, all
of it route; three performers on the centre line; the first 1.5 s from spawn.

## 5 · Water Grotto (08-11) — rejected on sight

One room, one pool, three temperaments: A on the ice at y=0, B on the basin
floor 3.5 m **under** the waterline, C wading the shallows at −1.2.

- Commit: `182e692ee1`
- Terrain: [water-grotto-terrain.ts](../../../src/lib/features/water-traverse/data/water-grotto-terrain.ts) ·
  Route: [test/water-grotto](../../../src/routes/test/water-grotto/+page.svelte) ·
  Probe: [grotto-probe.ts](../../../scratchpad/grotto-probe.ts)
- Measured: 1,630 m² walkable in 42 × 63 m, 35 colliders, ramps 21.8–26.6°,
  zero floor gaps, worst step 0.25 m

**Why it died (Austen):** *"why would one of the performers be underwater? if
one of them's underwater then it's not being reflected by the top of the water.
if all three are underwater then you can only see two at once."* Plus: the exit
existed in the terrain (`exit-bay`, `exit-ramp`, east) and was invisible in
play, and the orange posts were too crude an instrument to judge a mirror.

**Also cost:** most of a session lost to a rendering bug — the scene was handed a
stub `avatarState`, so `UnifiedCameraController` threw on frame one and the
camera sat at Threlte's default while 38 meshes drew correctly behind it.

---

## Design decisions already on record

These are in the museum tracker. Two of them **already name the failure of
attempt 5**, written before it was built:

- **`gp0dpD1l` SPRINGS LOOK-BACK MIRROR** — *"the visitor is ON ice, UNDER the
  sea, IN the pool, and never once stands over still liquid."* Proposes rehoming
  the grotto's reflection optics as the traverse's final view.
- **`zzt034TI` SPRINGS COURT FLIP** — diagnoses Earth and Fire as **dwell**
  spaces and the traverse as a **transit** space: *"a forward-only river that
  tells your feet to keep moving, so performers are things you pass at walking
  speed. Watching a sequence needs 15–30 s of standing still."* Proposes the
  reflection pool as **the room's centrepiece — the mirror as the teaching
  surface, not a look-back garnish.**
- **`l2vDxYLA`** — Water teaches the **hand path** before the letter. Water's
  primitive is the hand-path relationship, not the letter glyph.
- **`6bfjxuoT`** — the Water hand-path display must be staged in **dual-wheel**
  mode for split-same, because wall-plane staging clips arms.
- **`a9Faq6kN`** — Water shrinks to single-chamber scale, Fire/Earth length class.
- **`4cmrQvu4`** — ring-station grammar: each performer gets a dais the path is
  forced around. *This is the decision that produced the obstacle-in-the-path
  problem in attempt 4.*
- Sessions: `7jVOf8oQ` (chamber scale + hand-path-first), `CNK5Rdxb` (three channels)

---

## What went right (take these)

1. **The mirror.** Still water doubling a performer is the only thing water gives
   this museum that no other room can. It existed in attempt 1, has working code
   (`cacfc76e2e`, `4ddb53671a`, planar reflection + water optics), and every
   attempt since has either lost it or actively broken it.
2. **The rect-based terrain program.** `rect-colliders.ts` + a terrain module
   makes a room's whole geometry a constants change rather than a rebuild. This
   is why attempt 5's graybox took hours instead of days, and it is reusable
   as-is.
3. **The dev review bridge.** Lets a room be inspected from any vantage without
   pointer lock. Keep.
4. **The Ring shape** (attempt 2) — a loop around water, not a line through it.
5. **Fire's proof that a room needs to be a room:** 58 × 44 m, performers hidden
   until the mouth. That is the benchmark, and it is already built.

## What went wrong (do not repeat)

1. **Environment before feature set.** Five geometries were built before anyone
   wrote down what the Water exhibit is supposed to *teach*. The tracker says it
   — hand path first, dual-wheel staging, split-same — and no graybox has ever
   reflected that.
2. **Dressing before the box was approved.** The traverse reached a fourth-gate
   finish (reef, 712 specimens, fauna, atmosphere, 432 MB of source geometry)
   while its second gate had never been checked. The dressing is what hid the
   fact that the volume was a corridor.
3. **Transit instead of dwell.** Diagnosed in the tracker on 08-11 and still
   built into attempt 5 the same day.
4. **Gate approval on paper is not approval.** Three Channels passed a measured
   Gate 1 and was reverted hours after becoming walkable.
5. **Grayboxes judged by arithmetic, not by looking.** Every attempt has a probe
   proving continuity, grade and headroom. None of that predicted a single one of
   the rejections.
6. **Abstract markers for a room whose subject is a human body.** Orange posts
   cannot tell you whether a performer reads, or reflects.

## What to throw away

- All five geometries. None is a starting point.
- `trench-reef_raw.glb` (432 MB) and `trench-reef.glb` (29 MB) — content for a
  trench gallery that no longer exists in any plan.
- The 712-specimen seabed pipeline (`build-traverse-reef.py`,
  `generate-traverse-reef.py`, `prepare-traverse-reef-sources.mjs`,
  `seabed-heights.json`, `water-traverse-reef*.json`) unless a sea floor
  survives the new feature set.
- Ring-station grammar as decided in `4cmrQvu4` — daises the path is forced
  around are the obstacle problem, by construction.

## Open question the fresh start must answer first

Not "what does the room look like." **What does the Water exhibit teach, and
what does the visitor do while learning it?** The tracker already answers half
of that (hand path, dual-wheel, split-same) and no attempt has ever been built
from it. Every geometry in this pile was drawn before that question was settled,
and every one of them died of it.
