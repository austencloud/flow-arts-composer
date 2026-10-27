# Shared rules for every Flow Fest polish run

Read this before your workstream brief. The coordinator appends it to every
brief it launches; if your brief already ends with a copy, that copy wins.

## What you are doing

You are improving the look of Flow Fest, an Unreal Engine 5.8 game of a real
flow-arts camping festival on its real LiDAR-scanned site in south-west Ohio
(39.59 degrees north, 84.79 degrees west), held in mid-May. The game is at
`unreal/FlowFest` inside this git worktree. The art direction is in
`unreal/FlowFest/docs/polish-program.md`; read its first two sections before
you start, and judge your own work against them. The site record that
places the real structures is
`docs/superpowers/specs/flow-fest-sim/site-labels-interview.md` at the repo
root; its world coordinates (metres, x east, z south) are the same frame as
`Content/Data/site.json` and `ToWorld`. You own ONE workstream, named in
your brief. You work headless and cannot ask questions, so make sensible
calls, keep them conservative, and record every judgement call in your
report.

Order of reading: this file, your brief, `polish-program.md` (sections 1 and
2), `unreal/FlowFest/README.md`, then the code you own.

## Setup (already done for you)

- Your worktree and branch were made from local `main`. Do not switch branches.
- `unreal/FlowFest/Content` is a junction to the SHARED content store
  `E:/FlowFestContent58/Content`, used by every other worktree and by `main`.
  Never delete, move or replace that junction.
- The editor target may not be built yet in your worktree. Build first (below).
- Blender 5.0 is at `C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`.
  Run it headless the way `Tools/bootstrap.ps1` does:
  `& $Blender --factory-startup --background --threads 2 --python Tools/author-<ws>.py`.

## The shared content store: the most important rule

Up to three runs work at once against the same store. To keep from destroying
each other's work:

- Every NEW asset goes in your own folder, named in your brief
  (for example `/Game/FlowFest/Assets/Season/`, on disk
  `Content/FlowFest/Assets/Season/`). New materials carry your prefix
  (`M_Season_...`); new meshes may use plain names inside your folder.
- Never re-import, re-save, rename or delete an asset outside your folder
  unless your brief lists it under "You own".
- Never open and save the map `/Game/FlowFest/Maps/Festival`. The whole world
  is built at `BeginPlay` in C++; nothing needs to live in the map.
- Do not run `Tools/import-assets.py` or `Tools/author-assets.py`, with or
  without `--only`, unless your brief says you own them. Write your own
  `Tools/author-<ws>.py` (Blender) and `Tools/import-<ws>.py` (Unreal
  Python), copying the few helpers you need from the existing scripts
  (`material`, `cube`, `beam`, `fabric`, `sheet`, `export`, `import_file`,
  `expression`, `connect`, `paint_from_instance`). Stage FBX under
  `Tools/staged/<ws>/`.
- Never touch: `M_Ground`, `M_Dirt`, `M_Asphalt`, `M_MeadowGrass`,
  `M_LeafLitter`, `M_Fern`, anything under `Assets/Trees`, `Assets/Meadow`,
  `Assets/Floor`, `Assets/Car`, `Assets/Set`, `Assets/Ecology`, `Characters`,
  `Props`, `Megaplant_Library`, `Vegetation`, `Content/Data/*` (read-only),
  the shared plugin `unreal/Shared/`, or another workstream's folder, unless
  your brief says you own it.
- Never run editor-wide operations (resave all, fix up redirectors, reimport
  all, delete unused).

## C++ ownership

- New code goes in new files named for your workstream:
  `Source/FlowFest/FlowFest<Ws>.h`, `FlowFest<Ws>.cpp` and
  `FlowFest<Ws>Tests.cpp`. Unreal Build Tool picks them up automatically.
- In shared files touch only the functions your brief names. Two runs in the
  same wave may edit different functions of `FlowFestWorld.cpp`; they may not
  edit the same function. Where a brief gives two runs one line each at the
  end of the same function (for example a call at the end of `SetTimeOfDay`),
  add exactly that line and nothing else; the coordinator merges it.
- To reach the world's private data from your new file, add one block to
  `FlowFestWorld.h` at the end of the `private:` section, under a comment
  `// <Ws> polish`, containing the declarations you need (a `friend` for your
  builder, or member functions you add). Add exactly one call in `BeginPlay`,
  after the existing builders, under the same comment. Keep these shared-file
  edits to the fewest lines; the coordinator merges three of them at once.
- The shared plugin `unreal/Shared/FlowArtsRuntime` is off limits unless your
  brief names a specific additive method you may add to one of its classes.
  Additive means a new public method and its private state, no change to
  existing signatures or behaviour when the method is not called.
- Everything you place is deterministic: seed from indices with a hash like
  `WoodsHash` or `Hash01`, never from `FMath::Rand` or the clock. The same
  world must build on every run.
- Do not change the review camera positions, review hours or the HUD unless
  your brief says so (the Season run owns the clock; the Juggling run owns one
  showcase preset).
- Respect the existing budget of draw calls: instanced meshes
  (`AddInstanceGroup`) for anything placed more than a handful of times.
- Juggling code: Austen's own engine at
  `E:/shared-packages-six-club/packages/juggling-physics` (branch
  `codex/six-club-shared-20261015`) and `packages/siteswap-engine` may be
  read, run and ported. Never read, copy or port from `E:/jugglinglab`
  (GPL-2) or `E:/_CLONED/passist` (GPL-3); pattern names and siteswap
  notation are fine.

## Commands (run from `unreal/FlowFest`; Git Bash syntax)

- Build (about 3 minutes; run it in the background and wait for it):
  `"/c/Program Files/Epic Games/UE_5.8/Engine/Build/BatchFiles/Build.bat" FlowFestEditor Win64 Development -Project="$(cygpath -w $PWD/FlowFest.uproject)" -WaitMutex`
- Unreal Python import (forward slashes in `-script`):
  `"C:/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "$PWD/FlowFest.uproject" -run=pythonscript -script="$PWD/Tools/import-<ws>.py" -unattended -nop4 -nosplash -RenderOffscreen -log -abslog=<windows path to a log>`
  Check the log for `Failed to compile Material` and `LogPython: Error`.
- Tests:
  `"C:/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "$PWD/FlowFest.uproject" -ExecCmds="Automation RunTests FlowFest;Quit" -NullRHI -unattended -nop4 -nosplash -log -abslog=<log>`
  Count `Result={Success}` and look for `Result={Fail}`. Every existing test
  must still pass. Add one focused test file for new logic the way
  `FlowFestRoadTests.cpp` does: pure functions tested without a world.
- Screenshot capture (about 2 minutes each, 1920x1080; views `gate`, `camp`,
  `fire`, `overview`, `woods`; `-Hour` 0 to 24):
  `powershell -NoProfile -ExecutionPolicy Bypass -File Tools/launch.ps1 -Review fire -Hour 22.5 -AutoExit -Offscreen -LogPath "<win path>.log" -Capture "<win path>.png"`
  Build Windows paths in a shell variable with single quotes; a backslash
  before `$` inside bash double quotes swallows the variable.
  The log has a line `FlowFestReview frame timing after 10s warmup: avg X ms`.
- Explore on foot for a closer look: add `-Explore` (then no `-Offscreen`);
  `-Review fire -Explore` starts beside the fire field.

## Look at your work

- Take BEFORE captures of every view in your brief, at the listed hours,
  before you change anything. Take AFTER captures at the end with the same
  views and hours, back to back. Other runs share this PC's GPU, so frame
  timings are noisy; capture before and after close together and report both.
- Open your own screenshots (Read the PNG) and critique them honestly against
  the art direction before you call anything done. Iterate. A thing that
  compiles and places is not finished until it looks right in the capture.
- When something you built looks worse than what was there, remove it and say
  so in the report. A smaller, finished improvement beats a larger rough one.

## Performance budget

Baseline average frame times, 1920x1080 offscreen, before this program, are
in `polish-program.md` section 5. The game is capped at 60 fps (16.7 ms) and
the daytime views already sit at 17 to 19 ms, so there is no headroom.

- Your run may add at most 1.0 ms average on each of its views (1.5 ms for
  the fire field at night, because fire is particles). Measure, do not guess.
- If you need more, find it: fewer instances, no shadows on small lights,
  lower particle counts, culling distances, cheaper materials. Say in the
  report what you traded.
- No shadow-casting local lights. Point lights for string lights and
  lanterns are non-shadow, small radius, and few; prefer emissive meshes
  with a handful of lights for the look of many.

## Time

- Work in increments. Make the first visible improvement and commit it within
  about 90 minutes, then build outward. Commit after every working step.
- Aim to finish in about four hours of wall time. Stop at a good, captured,
  committed state rather than mid-way through a bigger idea; list what you
  did not get to.

## Style of the work

- Believable over flashy. This is a real place: a mid-May Ohio woodland
  festival, a working farm's fresh green fields by day and a dark rural sky
  at night. No fantasy glow unless it is real (fire, LEDs, string lights,
  headlamps). No saturated fog, no lens flares, no colour that the sun or a
  flame would not produce.
- Match the surrounding code: C++ idiom, comment density, naming, the Python
  write style. Comments say why, in plain words. Write files with LF endings.
- Nothing may be bought or downloaded. Build everything procedurally
  (Blender scripts, material graphs, Niagara, C++ placement) from what the
  repo, the engine and Austen's own packages already contain.

## Git and delivery

- Commit in this worktree on its branch as you go. Subject like
  `Flow Fest: what changed, in plain words`; a short body saying why; last
  line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never `git add -A` or `git add .`; add paths explicitly. Never stash, reset
  `--hard`, clean, or force anything. Do not commit `Saved/`, `Binaries/`,
  `Intermediate/`, `Tools/staged/` or anything under `Content/` except
  `Content/Data/juggling/` for the Juggling run.
- Do NOT merge, push, deploy or switch branches. Do not touch the primary
  checkout `E:/tka-platform` or any other worktree.
- Add a short paragraph to `unreal/FlowFest/README.md` describing what you
  added, in the voice of its neighbours, where your brief says.
- Leave your final before/after screenshots in
  `unreal/FlowFest/Saved/Polish/<ws>/` (untracked) and list the paths.
- End with a short report: what changed, commits, test counts, before/after
  frame timings per view, screenshot paths, judgement calls you made, and
  what you could not verify or left undone.
