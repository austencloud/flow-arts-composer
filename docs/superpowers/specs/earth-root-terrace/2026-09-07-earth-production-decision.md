# Earth production slice: decisions (2026-09-07)

Status: technical verification of the production shell in the full `/museum`
grid. No gate approval is claimed here; gate approvals are Austen's.

Water (`DrownedGalleryAuthored.svelte`) and Fire
(`FirstFireAuthored.svelte`) set the pattern: a Blender-authored shell, baked
lightmaps, one runtime component that owns the cave's light and its fixtures.
This slice applies that pattern to the Earth wing and records where Earth had
to differ.

The authority for what Earth *is* is the sealed
`docs/superpowers/specs/2026-08-11-museum-exhibit-hallway-architecture-design.md`
("Earth = the elevated terrace climb above the performers", "terrace-overlook
signature move") and the Phase 0 canon row: two hands in sync, arcing the same
way; from above, unison reads as a single shape; the barrier is elevation; the
payoff is the final ensemble sightline of three unison figures aligned. The
previous graybox in this wing was the Canyon Overlook, which predates that
sealing. It is deleted here rather than dressed.

## What was built

- `src/lib/features/museum/data/earth-root-terrace-terrain.ts` — the plan and
  its terrain program: a west vestibule at the Fire door, a ramp climbing to a
  terrace 2.8 m up, a descent to a landing at 1.2 m, a second descent to the
  Air door, and a rootbed 2.4 m *below* the door datum that the visitor never
  walks on. Doors, ramps, decks, the rail line, the three case positions, the
  aven centre and the ensemble sightline all derive from the compiled grid.
- `src/lib/features/museum/data/earth-root-terrace-blender-contract.ts` — the
  same plan expressed in the Blender frame, plus the seven QA cameras. Exported
  with a `sourceDigest` by `scripts/export-earth-root-terrace-blender-plan.ts`.
- `scripts/build-earth-root-terrace-graybox.py` — carves the measured shell
  from one rock mass and writes the graybox blend plus its report.
- `scripts/build-earth-root-terrace-production.py` — remeshes and skins the
  void, mounds the rootbed, splits the rock into the walked route and the pit,
  unwraps both, bakes a lightmap per piece under daylight and lantern light,
  denoises, exports and optimises into
  `static/models/museum/cave/earth-root-terrace.glb`.
- `src/lib/features/museum/components/game/EarthRootTerraceAuthored.svelte` —
  mounts that GLB at the room's plan centre, tunes the two emissive-only
  materials by name, stands four pedestals and four performers, and registers
  four pooled point lights.
- `Museum3DScene.svelte` skips the generic `cave-earth-*` performer loop when
  the authored component is present, exactly as it does for Water and Fire.

## Decisions

1. **The compiled contract is built from the FULL museum grid, not the cave
   rehearsal grid.** `buildVulcanCaveFloorPlan().grid` and
   `buildMuseumGrid(MUSEUM_WALK_ROOMS, …)` place the same room interiors but
   not the same neighbour distances: in the full museum the Fire room sits five
   metres further from Earth, so the corridor between the two doors is five
   metres longer. Both wings suppress their tile geometry, so nobody else draws
   that corridor — it has to be carved, and it has to be carved at the length
   the visitor actually walks. `buildCompiledEarthRootTerraceGrid()` is the
   single source, and the contract test asserts the two grids disagree exactly
   here so a future edit cannot silently swap them back.

2. **The two shells meet at one plane and neither crosses it.** Fire's rock
   block reaches 1.8 m past its own east wall (plan x 91.05); Earth's block
   starts at exactly that x. Fire bores its Earth door 0.8 m past its own block
   face, so the tunnel is continuous through the seam. Verified against the
   full grid rather than the cave rehearsal: Fire's east door lands at plan
   (89.25, z 56.25–58.25) and Earth's corridor arrives at the same wall across
   the same z span.

3. **The void is built from the graybox's two boxes, never from a bounding
   box.** The shell is an L — a room plus a corridor that doglegs south — and a
   bbox would put the outside face of the notch inside the void, carving away
   rock that is meant to be there. The two boxes overlap by a tenth of a metre,
   so they are joined and the difference is taken with `use_self`, resolving
   the self-intersection in the same exact boolean.

4. **The rock is split two ways: the walked route and the pit.** Not by room,
   because the room is one space; the split follows the *pedagogy*. The route
   is lit by brass and by the fire in the room behind, so it is warm; the pit
   is under five metres of rock and lit only by sky, so it is cool and darker.
   One material could not hold both, and the split is what lets the daylight
   pool on the rootbed read as daylight instead of as exposure.

5. **The daylight is a spot, not an area light.** The first pass used a wide
   disc at the top of the aven and the bed came out lit like an office: no
   shaft, no falloff, nothing for the three cases to be picked out of. Nineteen
   metres of rock with a hole in it collimates light. The cone angle is derived
   from the aven radius and the throw rather than dialled in, so a change to
   either datum keeps the shaft honest. A weak disc at the throat keeps the
   shaft walls from going black.

6. **The cool cast has to come from the light, because every rock set is
   warm.** Measured mean diffuse of the four PolyHaven sets used here:
   forest_ground_04 106/90/68, mossy_rock 108/107/87, rock_face 97/70/50,
   rocky_trail 147/128/107. All warm browns and olives. Tinting the pit cool at
   the material could only mute it; the daylight itself is (0.62, 0.78, 1.0).

7. **Texture periods are long and a low-frequency drift breaks the repeat.** A
   2 m period across a 21 m rootbed repeats eight times in one frame and the
   eye counts the repeats before it reads the rock. Periods are 3–4.5 m, and an
   object-space noise ramp multiplies each set's colour so every repeat is a
   different shade. The same drift is applied to the flat trim, where a single
   base colour on a moss patch read as painted plastic.

8. **The rootbed is mounded; every walked deck is not.** The collider reads its
   height from the plan, so a bump under a deck floats the visitor's feet. But
   nothing walks on the bed, so it takes 0.34 m of clouds displacement through
   its own vertex group and stops reading as a poured slab.

9. **Because the bed is mounded, the runtime measures it.** The three cases
   stand on the bed, and a pedestal placed at the plan datum would float or sink
   by whatever the mound did there. The component ray-casts down onto the loaded
   GLB at each case position and stands the pedestal on what is actually there,
   the same way the Fire courts measure their court stones. Each performer
   station is keyed on that measurement, because a station reads its standing
   surface once at mount.

10. **The case pedestals use the standard riser, NOT the eye-line rule.** The
    eye-line rule (`sizePedestal`) puts a prop centre at the visitor's eye. Here
    the visitor is five metres above the performer and looking down, which is
    the entire pedagogy of this wing; raising the cases to the walking line
    would put them level with the rail and destroy the overlook. The riser lifts
    the drawing clear of the ground and the elevation does the teaching.

11. **The ensemble eye stands half a metre from the rail, and that is
    geometry.** A rail of height h at distance d from an eye e above the deck
    hides everything below the ray of slope (e − (deck + h)) / d. From the
    landing's centre the nearest case was entirely behind the brass and the
    sightline crossed the bar at eye level. At half a metre the bar sits under
    the sightline, where a railing belongs, and the three cases nest away down
    the axis: one shape at three scales. The ensemble camera is 84°, because the
    row runs *away* from this eye — its figures are stacked in depth, twelve
    degrees below the horizon at the near case and forty-seven at the far one,
    and a normal lens holds one end or the other.

12. **The route is lit, not just the pit.** The first full bake left the exit
    descent and the vestibule near black: eleven metres of walk below the last
    lantern, and the wing stamp cut into a wall nobody could see. Lantern energy
    is raised and two soft fills sit at the two ends of the route — warm at the
    arrival out of Fire, cool at the walk toward Air. Contrast between a bright
    pit and a dim route is the point; a route the visitor cannot see is a
    missing floor.

13. **Nothing green glows.** The moss is not emissive. Moss that glows is a
    fantasy, and this room's green has to come from being alive, not from being
    lit. Only the sky disc and the lantern heads emit, and only those two are
    tuned by name at runtime.

14. **Four pooled lights, fixed count.** The shaft over the middle case, two
    rail lanterns, and the green seam at the Fire door that answers the light
    Fire lit on its own Earth door. The pool hands the shader the nearest three
    and the count never changes, so no light-count relink storm.

15. **The QA locator cones stand at performer height (1.7 m).** At 0.9 m they
    read as hidden behind the rail from viewpoints where a real performer would
    be plainly visible, and that misread cost a sightline iteration.

16. **The bed ray is cast in the shell's frame, not the museum's.** `GltfAsset`
    hands its `onReady` callback `gltf.scene` at load time, before that scene is
    parented to the group carrying the mount offset, so its world matrix is
    still identity. A ray aimed at a museum-space station centre missed the
    model entirely — and missed *silently*, because a miss falls back to the
    plan datum and the pedestals still look plausible. The browser walk caught
    it: all three cases reported exactly −2.400, the datum, to fifteen decimal
    places. Cast in the shell's own frame the three now read −2.478, −2.477 and
    −2.534, which is the mound. The mount only translates in X and Z, so a local
    hit's Y needs no transform back. Fire does not have this bug because it
    measures a named mesh with a `Box3`, which is frame-independent in Y.

17. **Earth's pedestal body is stone, not the shared slate.** `PedestalMesh`
    defaults to `#2b3a41`, the Drowned Gallery's wet slate. On a daylight-lit
    rootbed of pale olive rock that reads as a hole cut in the floor rather than
    a riser standing on it, and this is the one fixture every beat in the wing
    looks down at. Earth passes mossy_rock's own mean diffuse two stops down:
    the same stone as the bed, cut and set.

18. **The Fire wing is optional to the layout.** `buildEarthRootTerraceLayout`
    required both `cave-earth` and `cave-fire` in the grid and returned `null`
    without them. Fire is read for exactly one thing: the span of the corridor
    between the two wings, which both wings suppress and this module owns. The
    room picker can isolate `cave-earth` alone, and that grid has no such
    corridor, so the requirement made the isolated room fail in the worst way
    available - `null` layout, `null` contract, and an origin that collapses to
    `[0, 0, 0]`, mounting the whole shell at the world origin instead of around
    the visitor. The room rendered black with no error in the console. Fire is
    now optional and its absence yields an empty corridor; the full museum is
    byte-identical, and the isolated room reports the same bed heights
    (-2.478 / -2.477 / -2.534) and the same four light intensities
    (34, 9, 9, 14) as the full walk.

19. **Air and Sun had the same defect, and a test now covers all six wings.**
    Making the caves selectable in the room picker turned two more wings into
    reachable black rooms for exactly the same reason: `buildAirChimneyLayout`
    required `cave-earth` and `buildSundialLayout` required `cave-air`, each
    only to span the corridor to its neighbour. Both are now optional in the
    same shape as Fire. Because the failure is silent - no throw, no console
    entry, just a shell mounted at the world origin - it cannot be caught by
    looking at the app, so `tests/unit/museum/room-picker-isolation.test.ts`
    now walks every room the picker offers, builds a grid and terrain for it,
    runs every authored wing builder both isolated and in the full museum, and
    asserts each wing's geometry lands at the same offset from its own room's
    corner in both. `cave-water` is exempt from that last comparison: its
    isolation deliberately brings three rooms, and the packer is free to
    arrange them more tightly than the full walk does.

## Verification

- `tests/unit/museum/earth-root-terrace-terrain.test.ts` (16),
  `…-traversal.test.ts` (7), `…-blender-contract.test.ts` (6),
  `cave-terrain-routing.test.ts` (6),
  `museum-rendering-performance-contract.test.ts` (18) — 53 passed.
- Seven QA renders at 128 spp with OIDN denoise, in
  `blender/qa/earth-root-terrace-production/` (not committed; `blender/` is
  gitignored).
- Bridge-driven walk of the full `/museum` grid on a worktree server: the Fire
  seam at plan (90.5, 58.0), the corridor, the west door, the vestibule, the
  ramp, the terrace overlook, the landing ensemble eye and the exit approach.
  Every stop reported its expected standing height, no console errors, and the
  wing stamp, the three case letters, the daylight pool, the rail and the three
  unison figures all read from the eye the contract cameras were aimed from.
  The walk is also the empirical proof of the corridor seam in decision 2: the
  visitor stands on Fire's side of plan x 91.05 and walks through to the
  vestibule without leaving walkable tile.
- The walk earned its place. It found both of the defects in decisions 16 and
  17, neither of which any test or QA render could have shown: the renders are
  Cycles bakes of the shell alone, and the pedestals and the measured bed exist
  only at runtime.
- `tests/unit/museum` in full: 494 of 499 passed. The five failures are in
  `drowned-gallery-sightlines.test.ts` (3), `earth-canyon-blender-contract.test.ts`
  (1) and `earth-long-terrace-plan.test.ts` (1). All five fail identically on
  `main` with this branch's changes absent, so they are pre-existing and are not
  touched here.
- Room isolation, added after Austen hit a crash on `/museum`: `?room=cave-earth`
  now renders the terrace on its own. `window.__earth` reports the same three bed
  heights and the same four light intensities as the full walk, which is the
  check that distinguishes a working isolation from a shell mounted at the world
  origin. `?room=cave-fire` and `?room=cave-water` were used as the controls -
  both already isolated correctly, which is what localised the fault to Earth.

## Open

- The wing's Compression proposal and museum tracker question `LweZ97oG` are
  unanswered. Nothing here depends on either; both remain proposals.
- `earth-long-terrace-plan.ts` and `earth-root-observatory-plan.ts` are earlier
  Earth iterations still in the tree. They are not imported by this slice and
  are left untouched.
- A flat-shaded graybox door surround shows through the Air door at the end of
  the exit descent. It belongs to `cave-air`, which is still a graybox wing, and
  it is the same condition Fire's Earth door had before this slice. It is left
  for the Air slice rather than dressed from here.
- The corridor between the Fire and Earth doors is unlit. Both wings scope their
  pooled lights to their own room, and the visitor is in neither for the middle
  eighteen metres. Fire's slice shipped with this and it reads as a dark tunnel
  rather than as a fault, but it is a shared seam and belongs to whichever slice
  decides to own the corridor.
