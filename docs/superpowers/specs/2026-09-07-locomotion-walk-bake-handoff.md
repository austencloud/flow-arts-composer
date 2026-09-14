# Locomotion walk bake — Handoff (2026-09-07)

## Mission

Austen asked for on-foot walking — the player and the NPC crowd in the Flow
Fest sim — to feel like top-tier modern video-game walking rather than
"Ministry of Silly Walks / slow motion / desperately AI generated". His words
on 2026-09-06/07: research what shipping games and open-source controllers do,
measure our walk with real data, find root causes, fix the biggest gaps. He
also asked, honestly, whether there is a package that just makes the avatar
walk correctly. There is not; the visible defects turned out to be bugs in our
own retarget layer, and that answer was given and accepted ("Try again" =
keep going).

Domain canon: `docs/architecture/locomotion-research-canon.md`, rule
`.claude/rules/locomotion.md`, owner file `src/lib/shared/3d/AGENTS.md`.

Worktree: `E:/worktrees/tka-platform/walk-aaa`, branch
`codex/walk-seam-pelvis-curve`, based on `dbe6b169f9`.

## The pipeline you are working inside

A locomotion clip reaches the screen like this:

1. `shared-gltf-cache.loadSharedAnimation(url)` parses the pack GLB.
2. `trimLeadingHold(clip)` moves the keys to zero.
3. `extractClipFootprint(gltf.scene, clip)` samples the clip on the rig it was
   authored on, then `registerClipFootprint(clip, fp)` attaches it.
4. `LocomotionAnimator.createActions()` calls `trimLeadingHold` again
   (idempotent) and, per direction key with a footprint, `prepareClip()` runs
   `remapClipToSkeleton` then `bakeContactPreservedLegs`.
5. `bakeContactPreservedLegs` -> `solveClip` samples the clip, drives the hips
   to the footprint height, runs `HingeConstrainedLegIKSolver` per side, then
   `liftOutOfFloor`, and records six baked leg quaternions plus Hips.position
   per sample.
6. `analyzeClipGait` measures the baked clip and stores `pelvisDrop` per key.
7. At runtime `blendedPelvisDrop()` sums `weight * gait.pelvisDrop` over the
   direction keys and lowers the pelvis by that amount every `update()`.

Package realpath (read it here, never edit it here):
`E:/tka-platform/node_modules/.pnpm/@austencloud+scene-3d@0.1.6_96e649bf534708dfcc48227ef57be10d/node_modules/@austencloud/scene-3d`

## Done — verified

All four package changes are committed on this branch as **`e086abff42`**
(`fix(3d): bake feet without the flip, the snap-back or the seam`) in
`patches/@austencloud__scene-3d@0.1.6.patch`, and applied to node_modules in
both `src/` and `dist/`. Lock hash moved `6bc6fbe6...f23d` -> `dd64a841...11c6`.

Presence check run 2026-09-07:

```bash
for pat in LIFT_RELEASE_RATE LIFT_PREROLL ankleFlexionAxis mixerPose; do
  grep -c -- "$pat" node_modules/@austencloud/scene-3d/src/lib/services/implementations/ContactRetargeter.ts
  grep -c -- "$pat" node_modules/@austencloud/scene-3d/dist/lib/services/implementations/ContactRetargeter.js
done
```

Result: `LIFT_RELEASE_RATE` 3/3, `LIFT_PREROLL` 2/2, `ankleFlexionAxis` 2/2,
`mixerPose` 3/3, and `export function trimLeadingHold` 1/1 in
`clip-footprint.ts` / `.js`. The patch file set is exactly the HEAD file set
(345 `diff --git` entries, `diff` of the sorted lists is empty), so no package
file was dropped.

### 1. Footprint and clip now share one timeline

`trimLeadingHold` moved out of `LocomotionAnimator` into `clip-footprint.ts`
and exported, so `loadSharedAnimation` trims **before** the footprint is
sampled. Previously the footprint was sampled on an untrimmed timeline while
the mixer played a trimmed one, so every bake goal was skewed by up to one
source frame (33 ms at 30 Hz).

### 2. Foot-flip teleport removed (root cause found, not patched over)

`liftOutOfFloor` used to pitch the foot in the vertical plane through the
ankle-to-low-point arm. At toe-off the foot is within 3 mm of vertical, so a
sub-centimetre horizontal residual chose that plane, and its sign flipped
between adjacent samples. Measured baked steps before the fix: 37.7 deg +
35.2 deg on forward, 26.5 deg + 40.4 deg on the other side, in single frames.

Replaced with a fixed-axis dorsiflexion about a real ankle flexion axis.
`ankleFlexionAxis(ankle, toe, referenceWorld)` takes the world hip line,
negates it when `cross(axis, ankle->toe).y < 0` so positive theta always
dorsiflexes, and transforms it into ankle-local space. `liftOutOfFloor` then
solves the Rodrigues height equation
`y(theta) = a cos t + b sin t + c (1 - cos t)` for the smallest positive
dorsiflexion that puts the lowest shoe point on the floor.

### 3. Snap-back when the lift releases

The source clip's foot is 0.155 leg lengths; the shipped rigs are 0.19 to
0.23. At toe-off the lift held the tip on the floor and the next sample asked
for nothing: 16 deg (walk) and 27 deg (run) in one 120 Hz sample. Fixed with
`LIFT_RELEASE_RATE = 2 * Math.PI` rad per second of clip time, plus a
`LIFT_PREROLL = 0.25` s run-up so the release carries across the loop seam.

### 4. Mixer write-skip at the seam

three.js `PropertyMixer` skips writing a bound property whose accumulated
value did not change. The pre-roll's last sample and sample 0 evaluate the same
clip time, so sample 0 inherited the previous sample's already-solved legs and
already-lowered pelvis: steps of 18.2 / 19.8 / 26.2 / 30.7 deg at key 1 on
every lateral clip. `solveClip` now caches the mixer-written pose and hips each
sample and restores them after recording.

### 5. Test harness now runs the app's pipeline

`tests/unit/3d/locomotion-harness.ts` `loadPackClips()` was handing every suite
the raw pack: no trim, no footprint, therefore no bake. Every locomotion suite
was measuring a leg the app never plays. It now calls `trimLeadingHold`,
`extractClipFootprint` and `registerClipFootprint`, imported from
`@austencloud/scene-3d` through a new barrel export in `src/lib/index.ts`.

### 6. Measured result

Baked leg-track continuity across all 12 shipped rigs after the four fixes:

| Metric | Value |
| --- | --- |
| Worst per-key step, any rig | 9.2 to 14.2 deg (runStrafeRight LeftFoot, key 76) |
| Worst loop seam | 0.0 to 0.6 deg |
| Footprint / track / duration alignment | clean on all 12 |

For comparison the raw source clips carry per-key steps up to 43.2 deg, and
`runStrafeRight` itself does not loop cleanly (LeftUpLeg first-vs-last
19.2 deg). The baked legs are now smoother than the animation they came from,
and the key-76 residue is inherited from that clip's own seam.

## Believed done — unverified

Nothing is claimed done that has not been measured. What has **not** been done
is live browser verification: no Walk Lab or Flow Fest pass has been run since
the four package patches landed. Every claim above is headless measurement.
That verification is loose end #4 and it is required by
`.claude/rules/locomotion.md` before this can be called finished.

## In flight

Committed on `codex/walk-seam-pelvis-curve` as `e086abff42`:
`patches/@austencloud__scene-3d@0.1.6.patch` (all four fixes, src + dist),
`pnpm-lock.yaml` (new patch hash, must always ship with the patch), and
`tests/unit/3d/locomotion-harness.ts` (pipeline fidelity fix plus a new
`turnRate` option — see loose end #6 on `turnRate`).

Still uncommitted in `E:/worktrees/tka-platform/walk-aaa`:

| Path | State |
| --- | --- |
| `tests/unit/3d/locomotion-pelvis-drop.test.ts` | 232 lines vs 125 at the merge base. Bands describe unbaked clips. Must be re-derived, see loose end #2. |
| `docs/architecture/locomotion-research-canon.md` | items 10 and 11 rewritten on 2026-09-06. Now partly wrong, see loose end #5. |
| `tests/unit/3d/zz-scratch-*.test.ts` (9 files) | throwaway measurement rigs. **Delete before finishing.** |

Scratch scripts in the session scratchpad (delete or ignore, not repo files):
`patch-lift.py`, `patch-lift2.py`, `patch-lift3.py`, `patch-canon-walk.py`,
`ContactRetargeter.scratch.ts`.

## Test status (run 2026-09-07 in the worktree)

```bash
npx vitest run tests/unit/3d/locomotion-pelvis-drop.test.ts tests/unit/3d/locomotion-motion-quality.test.ts tests/unit/3d-worker-renderer/worker-performer-locomotion.test.ts
```

`Test Files 2 failed | 1 passed (3)`, `Tests 5 failed | 12 passed (17)`.
Note: do not pass `--reporter=basic`; vitest 4 no longer has it and the run
dies at startup with exit code 0.

| Failing test | Assertion |
| --- | --- |
| pelvis-drop > walking dip band | `ch01 forward: expected -0.00876399157732995 to be greater than or equal to 0.03` |
| pelvis-drop > toe pinned at floor | `ch01 toe: expected 0.010378229381271503 to be +0` |
| pelvis-drop > lowers pelvis by walk dip | `expected 0.05395243426061069 to be less than 0.0012360084226700502` |
| pelvis-drop > planted sole on floor | `ch07 sole hover: expected 0.050569552823236524 to be less than 0.04` |
| motion-quality > keeps the bob once the run tier has taken over | `expected 6.890409368308392 to be greater than 7.054390500264884` |

`tests/unit/3d-worker-renderer/worker-performer-locomotion.test.ts` is 2/2
green.

Both failures are real regressions of intent, not flakes. They are the next
two decisions.

## Loose ends (ranked)

### 1. Decide `pelvisDrop`. Start here.

The bake now owns pelvis height: baked `Hips.position` peak-to-peak is 0.0706 m
on the forward walk and 0.069 m on the run, against raw centimetre-unit tracks
of 172.4 and 323.9. `blendedPelvisDrop()` still subtracts a residual on top,
and that residual is now what holds the planted sole off the floor.

Planted-sole height, 12 rigs, walk at 1.368 m/s, drop applied vs drop zeroed
(measured 2026-09-07 by `zz-scratch-sole.test.ts`):

| Rig | drop applied | drop zeroed |
| --- | --- | --- |
| ch07 | 0.0459 | 0.0034 |
| ch42 | 0.0291 | 0.0006 |
| ch24 | 0.0236 | 0.0004 |
| ch10 | 0.0166 | 0.0023 |
| ch18 | 0.0129 | 0.0016 |
| ch01 | 0.0101 | 0.0013 |
| ch41 | 0.0075 | 0.0030 |
| ch12 | 0.0044 | 0.0021 |
| ch44 | 0.0008 | 0.0012 |
| ch34 | 0.0041 | 0.0276 |

ch21 and ch22 are marginally better with the drop. ch34 clearly prefers it and
is the case to explain before removing anything: find out why its bake leaves
the sole high, rather than keeping a global fudge for one rig.

Likely shape of the fix: a fourth package patch that removes or neutralises
`blendedPelvisDrop()` for clips that carry a footprint (i.e. clips the bake
already owns), leaving it in place for any clip that does not. Measure against
the table above before and after.

### 2. Re-derive `locomotion-pelvis-drop.test.ts`

Its bands (`WALK_DROP` 0.03 to 0.06, `STRAFE_DROP`, `RUN_DROP`,
`RUN_STRAFE_DROP`, `PLANTED_SOLE_MAX` 0.04) were measured on unbaked clips on
2026-09-06 and no longer describe anything real. Re-derive from baked
measurements after #1 lands, and add a real-data contract for the new
invariants this work established:

- baked leg tracks continuous across all 12 rigs (per-key step ceiling)
- no one-frame foot flip
- footprint / clip duration alignment
- loop-seam continuity

Per `feedback_real_data_in_tests`, these must measure the shipped rigs, not
fixtures.

### 3. Resolve the bob assertion honestly

`keeps the bob once the run tier has taken over` asserts a run displaces the
pelvis further than a walk. Baked run bob is 0.069 m and baked walk bob
0.0706 m, so it no longer holds. Do **not** widen the band to make it pass.
Either the run bake is wrong (the run clip's footprint is worth checking first,
since runStrafeRight is the one clip with a dirty seam) or the assertion
encodes an expectation the baked pipeline legitimately changed. Decide with
evidence and write down which.

### 4. Live verification (required by `.claude/rules/locomotion.md`)

Needs a fresh vite server on a free port, because :5173 caches node_modules
transforms and will not pick up the patched package. Never touch :5173.

- Walk Lab on every supported rig: ch01, ch12, ch44, remy, x-bot, at 1.368 m/s,
  side + ankles cameras, plant on.
- Check: joint teleports 0, foot toe ahead of ankle in swing.
- Run-speed sanity pass.
- Then `/test/flow-fest-sim`: player walk and the NPC crowd. The crowd is the
  original "slow motion" complaint; decide any crowd speed change with
  evidence, not by eye alone.

### 5. Rewrite canon items 10 and 11

The uncommitted rewrite says pelvis height is owned by `LocomotionAnimator`.
After #1 that is wrong: it is owned by the `ContactRetargeter` bake. Rewrite
honestly and add items for the lift-plane flip fix, the lift release plus
pre-roll, and the mixer write-skip restore.

### 6. Cleanup and integration

- Delete all nine `tests/unit/3d/zz-scratch-*.test.ts`.
- Decide on harness `turnRate`: keep it only if a real test uses it, otherwise
  drop that hunk.
- Commit with explicit pathspecs only, per
  `.claude/rules/commit-only-your-own-changes.md`.
- Merge `main` into the branch.
- `rmdir` the `node_modules` junction in the worktree first (see Gotchas), then
  from PowerShell in the primary:
  `npm run wt:finish -- codex/walk-seam-pelvis-curve --route /test/flow-fest-sim`

### 7. Documentation owed

- Document the slip metric reading: the 15 cm figure is ankle pivot over a
  planted ball plus pre-lock glide, not 15 cm of skate.
- Document the 30 Hz key-interpolation knee twitches.

### 8. Memory updates owed

- `project_flow_fest_arrival_arc.md` (CRLF line endings).
- New reference memory: vitest resolves `@austencloud/scene-3d` to `src` via the
  vite alias, and the test harness must register footprints or the bake never
  runs.
- Add to `reference_scene3d_patch_workflow.md`: `pnpm patch` must always carry
  the version.

## Decisions already made

- **No magic package.** Austen asked whether some released package just makes
  the avatar walk correctly using the bones we have. Answer given 2026-09-07:
  there is none; the defects were bugs in our own retarget layer. He replied
  "Try again", meaning keep going. Do not re-open this.
- **No artifact for the big-picture assessment.** Austen was explicit. Report
  in the terminal.
- **Canopy exchange design comes after walking is right.** Not now.
- **Commit and push without asking is approved. Deploy is approved. Do not push
  `main`** — it is far ahead with other sessions' deploy-gated work.
- The per-phase pelvis drop curve was built, measured and **rejected** on
  2026-09-06: it moved the planted sole from 2.0 cm to 1.4 cm but added 2.2 cm
  of pelvis bob per stride, and the bounce is what an eye reads. Do not rebuild
  it.
- Final report must end with the clickable link
  https://localhost:5173/test/flow-fest-sim and that surface must be showing in
  the in-app Browser pane.

## Gotchas

**Package editing.** Never edit `node_modules` or `patches/` by hand for
anything you intend to keep. Use the pnpm patch workflow: a fresh edit dir every
time, and **always pass the version** —
`pnpm patch @austencloud/scene-3d@0.1.6 --edit-dir <dir>`. Omitting the version
writes a versionless patch file, adds a versionless entry to
`pnpm-workspace.yaml`, and then `patch-commit` fails with
`ERR_PNPM_UNUSED_PATCH`. Recovery, if it happens: move the patch onto the
versioned filename, restore `pnpm-workspace.yaml` from HEAD, `pnpm install
--offline`. Patch **src and dist** — vite/vitest read `src`, the built app
reads `dist`. Run `pnpm patch-commit` from the primary checkout, then verify the
new patch file set is a superset of HEAD's and grep node_modules to confirm the
change landed.

**Never `pnpm install` through the worktree junction.** The worktree's
`node_modules` is a symlink to `E:/tka-platform/node_modules`. Installing
through it relinks the primary's 168 top-level packages.

**`wt:finish` deletes through junctions.** `rmdir` the worktree's `node_modules`
junction before running it, or it will delete primary files.

**Imports.** `@austencloud/scene-3d/dist/lib/services/clip-footprint.js` fails
with "Missing specifier". A relative or realpath **dist** import resolves a
different module instance and will silently give you a second copy of the
footprint registry. The **src** realpath import works, because vitest uses the
vite alias in `vite.config.ts` (around line 1046) to point the package at
`src/index.ts`. This is why the barrel export in `src/lib/index.ts` was the
right way to reach `trimLeadingHold` from tests.

**Dev server.** Port 5173 and the `tka-dev` pm2 app are Austen's. Never start,
restart, replace or kill them, and never run `scripts/start-dev.ps1`. Probe
read-only with `curl.exe -k -g "https://[::1]:5173/"`. `pm2 logs tka-dev
--nostream` is allowed. A task-owned server uses a free port and is stopped the
same turn. Other agents hold 5431, 5197 and 5192; at most two agent vite servers
at once.

**Browser.** DevTools pages 48, 49 and 50 belong to other sessions — do not
close them. Austen's live tab is read-only. This task owns page 52; close only
that one, parking it on `about:blank` if it is the last. Browser instrumentation
recipes that were set up on page 52: import three from
`/node_modules/.vite/port-5173/deps/three.js?v=919bde69`; hook
`Object3D.prototype.updateMatrixWorld` into `window.__legBones`; hook
`AnimationMixer.prototype.update` into `window.__mixer`; hook
`LocomotionAnimator.prototype.update` into `window.__animator`. There is also a
`window.__gaitProbe` API.

**Bash tool on this machine.** No apostrophes inside command content, no
backticks in grep patterns, at most one heredoc per command, foreground `sleep`
is blocked. Write Python patch scripts with the Write tool and run them with
Bash; use `io.open(..., newline="")` so CRLF survives.

**Git.** Scoped commits with explicit pathspecs only. No `git add -A`, `.`, or
`-u`. No stash. `git checkout --` is hook-blocked; to restore a file use
`git show HEAD:<path> > <path>`.

**Do not touch** `scripts/audit-frame-budget.mjs`,
`docs/superpowers/specs/flow-fest-sim/austen-site-markers.json`, the blossom
files, or other sessions' in-flight work. `audit-frame-budget.mjs` shows as
modified in the primary and is not ours.

**Dead ends already tried.** The per-phase pelvis drop curve (rejected, see
Decisions). Widening the pelvis-drop bands to make the suite green — that is how
the harness fidelity gap stayed hidden for a day; the bands were describing
clips the app never plays.
