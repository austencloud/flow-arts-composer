# Drowned Gallery Phase 1 Graybox — Handoff (2026-08-02)

## ADDENDUM (2026-08-02 late session — pickup complete)

The play-tester succeeded: traversal fixed at the data level (`cf707da460`,
report at `2026-08-02-drowned-gallery-playtest-report.md`). The pickup session
then fixed the SECOND half of the same bug — the graybox VISUALS still encoded
the wrong corridor assumption (floor slab, water, surfacing steps, and the
grotto-south wall's door gap all sat at the sump's x-span, ~11 m east of the
real door). The corridor's carved Z-shape + wall tiles are now decomposed off
the real grid in `buildDrownedGalleryLayout` (`corridorSegments` /
`corridorWallRuns`) and both the terrain zones and the graybox consume the
same layout rects — physics and visuals can no longer disagree. Also softened
the sump entry ramp 2 m → 4 m (~52° → ~33°, loose end #4). 204/204 museum
tests green, svelte-check 0/0, browser re-walk done (approach, corridor jog,
steps reveal at the REAL west door, grotto reveal frames all read correctly).
Remaining: loose ends #2 (ask Austen what "the other end" means), #3 (his
eye-level re-walk = the gate), #5 (stale CAVE_MODE_ROOMS entry, cosmetic).

## Mission

Build the Vulcan Cave Water room ("The Drowned Gallery") as a walkable graybox
so Austen can judge layout, flow, and scale at eye level before any art spend
(the Phase 1 gate). Design spec:
`docs/superpowers/specs/2026-08-02-vulcan-cave-water-room-drowned-gallery-design.md`
(approved by Austen 2026-08-02, includes the full 19-performer roster and the
Phase 2–4 plan). Implementation plan (executed in full):
`docs/superpowers/plans/backlog/2026-08-02-drowned-gallery-graybox.md`. Floor-plan
sheet: `static/sketches/2026-08-02-drowned-gallery-plan.html` (served at
`/sketches/2026-08-02-drowned-gallery-plan.html` — Austen loved it).

**State at handoff: the graybox is built, tested, visually passed by Fable at
1920 — but Austen's own walkthrough FAILED on traversal** (see Loose ends #1).
The Phase 1 gate is NOT passed. A Sonnet play-tester agent was dispatched and
may still be running or finished — its report lands at
`docs/superpowers/specs/2026-08-02-drowned-gallery-playtest-report.md`
(committed by the agent itself if it succeeded). READ THAT REPORT FIRST.

## Done — verified

- **Graybox implementation, 8 commits by an Opus executor** (`4120d149de`,
  `987ad1d960`, `e25fd4be76`, `892957523b`, `009cbd52a3`, `2693b7ec13`,
  `d6e2ff8d51`, `07e57fd62a`): approach/sump/grotto rooms in
  `vulcan-cave-floor-plan.ts`; terrain program
  (`src/lib/features/museum/data/drowned-gallery-terrain.ts`) with elevation
  zones + pool/shore/gate blocking; physics ground-clamping + blocking in
  `museum-physics-provider.ts`; A/B/C loop sequences (MCP-generated, verified
  `alpha3→alpha3`) wired to three performers; performer `elevation`/`worldY`
  threading; `suppressTileGeometry` rendering flag;
  `DrownedGalleryGraybox.svelte` visual layer; waterline submersion event +
  blue overlay on `/test/museum-cave-3d`. Evidence: executor's final run —
  `npx vitest run tests/unit/museum/` → 20 files, 197/197 passed; `npm run
  check` → 0 errors 0 warnings.
- **Fable's post-executor fixes:** `2dbb22a75e` (surfacing steps re-anchored to
  the sump door's x-span — the terrain zone AND graybox ramp sat 7 m west of
  the actual door; found by probing `elevationAt` along the walk line, a 1.9 m
  vertical snap at the grotto entrance), `bf04812e20` (lighting pass: emissive
  water, alcove niche lights, approach waterline glow, sump half-light, dome/
  waterfall fills). Evidence: 197/197 after each; browser frames described
  below.
- **Visual pass at 1920 (Fable, station teleports via sessionStorage):** the
  reveal frame shows glowworm dome + three performers with pictograph discs +
  waterfall + gate; the overlook frame shows the mirror pool REFLECTING each
  alcove's firelight (three warm streaks — the concept's doubling effect
  works); gate close-view shows caveman C through gold bars at ~5 m; the
  approach shows the blue waterline glow at the descent's bottom; the sump
  submersion overlay fires exactly at the waterline. Console clean (no
  errors/warnings). Screenshots were read in-session, not saved to disk.
- **Docs committed:** design spec (`da0c97b14b`, updated `6a8df93ad8` — cites
  `static/retro-eras/cave-painting.html` as the pictograph→cave-painting
  source — and `bba23387f0` — 19-roster + water-shader findings), plan
  (`5140099a67`).

## Believed done — unverified

- **The Sonnet play-tester's fixes.** Dispatched ~15:00 2026-08-02 with a brief
  to: build `tests/unit/museum/drowned-gallery-traversal.test.ts` walking the
  route through the real `MuseumPhysicsProvider` spawn→Fire-door, fix
  `drowned-gallery-terrain.ts` zone defects it finds (prime suspect: corridor
  zones are assumed rects that miss the real routed corridors → `elevationAt`
  returns 0 → player walks ON TOP of the water — matching Austen's report
  exactly), verify the pool stays blocked and overlooks reachable, commit with
  pathspec, and write
  `docs/superpowers/specs/2026-08-02-drowned-gallery-playtest-report.md`.
  AUDIT ITS WORK: read the report, check its commits exist, re-run
  `npx vitest run tests/unit/museum/`, and re-walk the route in the browser
  before telling Austen it's fixed.

## In flight

- Nothing uncommitted from this session's own work (post-playtester state
  unknown — check `git status` for the report + terrain/test files).
- The worktree carries MANY other sessions' uncommitted changes (agent-hub,
  CAPS, browse/gallery, shop, `MuseumFloorPlanPreview.svelte`'s predecessor
  diff). Do not stage/commit/revert anything you didn't touch. `main` has 15+
  local commits ahead of `origin/main` from multiple sessions — do not push
  without confirming ownership of every unpushed commit.

## Loose ends (ranked)

1. **Traversal: Austen could not walk the route.** His report (2026-08-02):
   could not reach the other end; the game "really did not want" him to go
   underwater; the water felt "really awkward on top" — i.e. he was walking on
   top of the water surface. Start from the play-tester's report; if it
   succeeded, audit + browser-verify (station-teleport trick below) + have
   Austen re-walk. If it failed or never ran, do its brief yourself (the
   dispatch prompt is reproduced in this doc's "Believed done" item).
2. **"I really do want to reach the other end."** Ambiguous and gate-relevant:
   if he means the EXIT, #1 covers it. If he means the FAR SHORE (alcove
   side), that contradicts the current design (the pool IS the barrier; the
   habitat shore is deliberately blocked per the rebuild handoff's gate/
   barrier requirement). Ask him ONE question when he returns, or design a
   compromise (e.g. the gate leg continuing behind the alcoves as a close
   "backstage" path). Do not silently open the habitat.
3. **Phase 1 gate: Austen's eye-level approval** of layout/flow/scale after
   traversal is fixed. Only then Phase 2 (shell + water, per spec).
4. **Sump entry ramp steepness** (~52°, executor + Fable both flagged; reads
   as a chute). Cheap to soften in the terrain zones + graybox ramps —
   consider stretching the descent to 4 m before Austen's re-walk.
5. **Stale `CAVE_MODE_ROOMS` entry** for `cave-water` (`performerId:
   "cave-water-automaton"`, `sequenceId: "cave-water-seq"` no longer resolve;
   HUD subtitle "Split-time / same-direction" is fine but the plan page's
   solo-performer boolean is now false for the grotto). Cosmetic; fix when
   touching that file.
6. **Overall darkness** is intentional graybox austerity — real light design
   is Phase 2. Don't polish graybox lighting further unless Austen asks.

## Decisions already made (Austen, all 2026-08-02)

- **Concept: "The Drowned Gallery"** — cave-native water only (sump entry,
  waterfall, mirror pool, drip rain, glowworm dome); NO reef/coral/tropical
  dressing (that was the rejected-borrowed-elements failure mode). The
  full-ocean-immersion idea was consciously set aside as "a different
  attraction", not killed.
- **Fish: existing FishBoids + existing GLB catalog only** — "we don't need to
  make boids when we have gorgeous fish that already exist." No new fish
  assets. (Phase 3.)
- **One caveman per letter; 19 total** across the cave = the founding
  collection "TKA 1: Learning Letters" roster; per-room map resolved in the
  spec (Water A/B/C; Sun gets FOUR: S/T/U/V). Water teaches A, B, C.
- **Graybox-first with hard gates** — his explicit ask after a prior
  beautiful-spec/disappointing-3D experience. No art until he approves space.
- **Budget discipline:** no fan-outs/panels/workflows; one Opus executor per
  phase (Opus preferred "because he's half the price"); Sonnet fine for lesser
  tasks; Fable does synthesis + visual verification only.
- **Meshy-via-Codex** asset workflow (props/artifacts/hero pieces only, his
  approve/deny per model) is speced for Phases 2–4; deliberately NOT started.

## Gotchas

- **Playing the game programmatically:** synthetic KeyboardEvents do NOT move
  the FPS player (pointer-lock/UCC gating). The working technique:
  `sessionStorage.setItem("museum-cave-3d-state-v1", JSON.stringify({playerWorldX, playerWorldZ, viewMode:"first-person", topDownHeight:12, playerYaw}))`
  then `location.reload()` — validated against walkable tiles on restore. Yaw:
  north=π, east=π/2, `atan2(dx, dz)`. Useful station coords (world units,
  x,z): approach 14.25,54 · sump 14.25,34 · reveal 14.25,22.2 · overlook B
  14,18.4 · gate view 25,7.6 (yaw −2.415). Headless: walk via
  `MuseumPhysicsProvider.movePlayer` in a vitest harness — cheaper and
  assertable.
- **North = decreasing worldZ**; wing bounds are tiles (×0.5 = meters) and
  include the 1-tile wall ring. Elevation datum: museum floor 0, waterline
  −1.5, sump floor −4.1, causeway −0.3, shelf −1.0.
- **Terrain zones are first-match rects** in `drowned-gallery-terrain.ts`;
  anything not covered returns elevation 0 — which is exactly how the
  walking-on-water class of bug happens. Corridor coverage must match the
  REAL routed corridors, not assumptions. Unit tests probe points; only the
  traversal harness walks lines.
- **`elevationAt` probing beats screenshots** for geometry bugs (found the
  1.9 m door snap in seconds). In-page: `await import("/src/lib/features/museum/data/vulcan-cave-floor-plan.ts")`
  then `plan.grid.terrain.elevationAt(x,z)` from the console/evaluate_script.
- The executor deviations are recorded in its report (summarized in the plan's
  git history): Task 1's commit legitimately carries predecessor cave files
  (they were uncommitted in the tree and required to compile);
  `narrowDoorWall` (minMargin 0) exists for the sump's 2.5 m width.
- The test route has NO audio (soundscape player lives in MuseumModule, not
  the test page) — silence in the graybox is expected, not a bug.
- Loading overlay sits at 93% "Lighting six demonstrations" for a while on
  this route; `wait_for` room-name text, not percent.
- Chrome DevTools MCP: shared instance via
  `pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank`;
  task-owned tab, `emulate` per viewport, webp/70 screenshots, close only your
  tab.
