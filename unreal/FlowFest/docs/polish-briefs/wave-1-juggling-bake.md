# Wave 1, run C: Juggling, baked from Austen's engine

Workstream `Juggling`. New source files `FlowFestJuggling.h`,
`FlowFestJuggling.cpp`, `FlowFestJugglingTests.cpp`; new tool
`Tools/bake-juggling.mjs`; new data folder `Content/Data/juggling/` (the one
place under `Content/` this program commits). No content folder is needed
unless you author a mesh (then `/Game/FlowFest/Assets/Juggling/`). Ready to
launch; no answer needed.

## Why this run matters

Jugglers are part of this festival: at the juggling tent all afternoon and
inside the fire circle at night, solo and passing, some with fire clubs.
Today the only juggling in the game is one captured clip. Austen has a
deterministic juggling engine of his own; this run bakes its output into
frames Unreal can play on the existing characters, hand IK and club prop,
so that the Jam runs can put real juggling in the circle. Exact motion from
the tuned engine comes first; a live C++ port is a later run.

## The engine

`E:/shared-packages-six-club/packages/juggling-physics` on branch
`codex/six-club-shared-20261015` (read-only to you; do not commit there).
Read `src/passing-scene.ts` end to end (536 lines). `samplePassingScene(t,
{patternId, bpm, performerPositions, performerHeight})` returns, for a
time in seconds, every performer's feet position, facing (radians, 0 faces
+Z), both hand positions and palm orientations, and every club's grip
position, orientation (local +Y along the club), holder and kind. Units
are metres, Y up. Eighteen patterns: five two-person (4-count, 3-count,
2-count, ultimate, Jim's 2-count with seven clubs), twelve rings of three
to six people, and a three-person feed. Clubs follow ballistic flight at
the centre of mass 22 cm along the club from the grip; hands follow
Catmull-Rom loops scaled to body height; club spin is singles, doubles on
the 4p throws. Solo juggling goes through `src/jif-animator.ts` (a generic
JIF animator, less tuned) with siteswaps from
`../siteswap-engine/src/pattern-database.ts` (38 named patterns). There is
no export script; you write it. There are 62 tests in `tests/`; run them
once to see the engine works on this machine. Build the package with its
own `tsc` (`npm run build` in the package; use its `node_modules` if present,
otherwise the `tsc` in this worktree's `node_modules/.bin`).

Never read or copy from `E:/jugglinglab` or `E:/_CLONED/passist`.

In Unreal: `UFlowFestAvatarComponent` (shared plugin) plays clips and
exposes `GetHandTransform`; `UFlowFestPropComponent` binds a prop to the
hands and carries "captured wrist targets in world space for the animation
evaluator's hand IK" (see its header, around `BindHands` and the wrist
target members). The club prop is `club` in `Content/Data/props.json`
(meshes `club_default` and `club_default_right`, 52 cm, 22 cm handle). The
crowd builds people in `BuildPeople` in `FlowFestWorld.cpp`: an actor, an
avatar component, optionally a prop component; copy that pattern.

## You own

- `Tools/bake-juggling.mjs`, `Content/Data/juggling/`, your three source
  files.
- One additive method pair on `UFlowFestAvatarComponent` in the shared
  plugin: `SetExternalHandTargets(const FTransform& Left, const FTransform&
  Right, float Weight)` and `ClearExternalHandTargets()`, implemented by
  feeding the same hand-IK path the prop component's captured wrist targets
  use. Read the evaluator first to find that path. If it turns out the IK
  path cannot take targets from outside the prop component, the fallback is
  to drive a `UFlowFestPropComponent` equipped with `club` and set its wrist
  targets through whatever public method it has, and to say so. Change no
  existing signature or default behaviour.
- `Tools/launch.ps1` and `FlowFestCharacter.cpp` only to add a `juggling`
  value to `-Showcase` (the `ValidateSet` and the showcase branch) that
  frames the jugglers at the juggling tent from 4 m at eye height at 17.0.
- `FlowFestWorld.h` your `// Juggling polish` block and one call in
  `BeginPlay` after `BuildPeople`.
- README: a paragraph after the one about the 38 attendees.

You do not own: the crowd, the fire, structures, the night. Your jugglers
are your own actors for now; the Jam and Crowd runs fold them into the
crowd later.

## Build this, in this order

### 1. The bake

`node Tools/bake-juggling.mjs` (run from `unreal/FlowFest`, importing the
built `dist/index.js` of the engine by absolute `file://` path) writes
`Content/Data/juggling/index.json` and one binary per pattern per height:

- Patterns: all 18 passing patterns at their default bpm (150), plus six
  solo patterns through the JIF animator with clubs: siteswaps `3`, `441`,
  `531`, `4`, `53`, `5`. If the JIF animator cannot produce a usable club
  pattern for one of them, drop it and say which.
- Heights: 1.65, 1.80 and 1.95 m. The engine scales hand loops to height;
  flights are gravity so they do not scale, which is why three bakes.
- One full `cycleBeats` cycle per pattern at 60 samples per second, so it
  loops seamlessly (the last frame leads back to the first).
- Binary layout, little-endian float32 unless stated: a 16-byte header
  (magic `JUG1`, uint32 performer count, uint32 club count, uint32 frame
  count), then per performer feet x z and facing (3 floats), then frames.
  A frame is, per performer, left hand position (3) and orientation
  quaternion (4), right hand position (3) and quaternion (4); then per
  club, position (3), quaternion (4), holder as a float (-1 for in flight,
  else performer index times 2 plus 0 for left or 1 for right), and kind
  (0 held, 1 self, 2 pass). `index.json` lists each file with its pattern
  id, label, notation, bpm, performer count, club count, cycle seconds,
  frame count and height. Expect about 10 MB in total; report the size.
- Coordinates in the file are the engine's: metres, Y up, performers
  centred near the origin, +Z the default facing. The C++ side converts.
- A test in `FlowFestJugglingTests.cpp` loads one file and checks the
  header, that every held club sits at its holder's hand within 1 mm, and
  that frame 0 and the last frame are continuous (hands within 5 cm).

### 2. The player component

`UFlowFestJugglingComponent` (or a plain class driven from your world
block): loads a pattern by id and height, owns the club meshes (an
instanced static mesh of `club_default` per pattern instance, updated per
tick with `BatchUpdateInstancesTransforms`), and for each performer slot
takes an avatar component and a transform (feet position in world, yaw).
Per tick it samples the frame at the pattern's phase (interpolating between
frames), converts engine space to Unreal (metres to centimetres; engine Y
up to Unreal Z up; engine +Z facing to the performer's yaw; mirror the
handedness as needed; verify by the held-club test), places the clubs, and
calls `SetExternalHandTargets` with weight 1 while juggling, ramping to 0
over 0.5 s when it stops. The performer's base pose is the idle clip (not
the captured juggler clip, which would fight the IK). Add a slow head-up
look toward the highest club if the avatar exposes any head control;
otherwise skip.

Pattern phase runs on world time so two instances of the same pattern are
in different phases; when the Jam run later needs synchronised partners,
the component already takes a phase offset.

### 3. Jugglers at the tent by day

From your world block, after `BuildPeople`: spawn three of your own
people (deterministic character ids, the way `BuildPeople` spawns) on the
grass south-east of the juggling tent, which the Structures run builds
centred at (93.6, -87.3) with a 10 m footprint: a passing pair at
(95, -79) and (98, -79) facing each other doing `four-count` at 1.80 m,
and a solo at (90, -80) doing `441` at 1.65 m, visible from 14:00 to
20:30 and hidden otherwise (the Jam run takes them into the circle at
night). Give the pair a slow change of pattern every 90 s through the
two-person set (4-count, 3-count, 2-count, ultimate, Jim's), with a 2 s
stop between (clubs held). Use `SurfaceAt` for feet height.

### 4. The showcase preset

`-Showcase juggling`: the camera 4 m from the pair at eye height, 17.0,
HUD as usual, so the coordinator can judge the motion in one capture
command. Record a 10 s sequence of `HighResShot` frames or describe the
cadence in the report.

## Review

- `-Showcase juggling -Hour 17 -Capture ...` plus the same with `-Explore`
  to watch it move; `overview` 17.0 (the pair should be visible as two
  figures by the tent); `fire` 17.5 (Middle Earth by day; the jugglers are
  in its south-east corner).

Watch for: clubs sliding in the hand, hands reaching through the body,
elbows locking, clubs passing through each other at the catch, feet
sliding when the IK pulls, the base idle breathing fighting the hand
targets. Fix what you can with the weight ramp and the hand offset; report
the rest.

## Done when

- The bake exists for all patterns and heights with the index; the load
  test passes.
- The pair passes a visibly correct 4-count at the tent: six clubs, every
  catch lands in a hand, no club vanishes, spins read.
- The solo juggles a cascade and a 441 with three clubs.
- The avatar method is additive and the existing prop-holding crowd and
  player are unchanged (walk the camp and check).
- All existing tests pass; yours pass.
- Frame time at `overview` 17.0 within +0.5 ms.

## Judgement calls to record

How the hand IK path was reached; the space conversion and how you verified
it; any pattern dropped; the JIF animator's quality for the solos; the
instance update cost per tick.
