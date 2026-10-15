# Scene Boot Cost — Measured, and the Dead Ends

**Status:** settled 2026-09-02; two defects found and fixed the same day.
Re-open only with new measurements from the boot profiler, never from
reasoning about what "should" be slow.

This document exists so no future session re-derives it. Three separate
sessions independently proposed texture cooking as the fix for 3D load time.
It is not the fix, and the numbers below are why.

## Why this was written

Austen demos the app to people at parks. Load time is the product problem.
Two plausible-sounding fixes were proposed, costed, and then killed by
measurement:

1. Cook all scene textures to KTX2/Basis.
2. Migrate the renderer to WebGPU.

Both were killed. Neither should be proposed again without new evidence.

## The instrument

`src/lib/shared/3d/scene-boot/boot-profiler.ts` — opt-in, ships on `main`,
zero cost when off.

Enable any one of:

- `?bootprofile=1` on the URL
- `localStorage["tka-boot-profile"] = "1"`
- `window.__sceneBootProfileEnabled = true`

It attributes the boot window by patching `createImageBitmap` and the WebGL
prototypes, and unions the resulting intervals rather than summing them —
summing 210 concurrent texture decodes describes no elapsed time. Categories:

| Category        | What it patches                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch`         | `PerformanceObserver` resource entries                                                                                                            |
| `decode`        | `createImageBitmap`                                                                                                                               |
| `textureUpload` | `texImage2D`, `texSubImage2D`, `texImage3D`, `texSubImage3D`, `texStorage2D`, `compressedTexImage2D`, `compressedTexSubImage2D`, `generateMipmap` |
| `bufferUpload`  | `bufferData`, `bufferSubData`                                                                                                                     |
| `shaderSync`    | `compileShader`, `linkProgram`, `getProgramParameter`, `getShaderParameter`, `getProgramInfoLog`                                                  |
| `gpuSync`       | `finish`, `readPixels`                                                                                                                            |

It also reports `blockedMs` (union of long tasks), `unexplainedBlockedMs`
(blocked minus instrumented GPU calls — i.e. GLB parse and scene-graph work),
and `idleMs`. The report publishes to `window.__sceneBootProfile` and prints
to the console at reveal.

Interval math lives in `boot-interval-math.ts` and is unit-tested.
`tests/unit/boot-profiler.test.ts` exists because `npm run check` does **not**
typecheck a plain `.ts` file reachable only through a Svelte import graph — a
syntax error in the profiler passed a green check and took down every 3D scene
on `main`. That test imports the module so vitest transforms it. Do not delete
it.

## The numbers

Ocean scene, dev server, `/test/ocean-scene?bootprofile=1`.

| Run  | assets   | compile  | settle   | total     |
| ---- | -------- | -------- | -------- | --------- |
| Cold | 5,530 ms | 5,242 ms | 3,250 ms | 14,024 ms |
| Warm | 2,709 ms | 1,823 ms | 3,167 ms | 7,700 ms  |

Warm-run attribution across the whole 7,700 ms window:

| Slice                                                  | Wall       | Calls |
| ------------------------------------------------------ | ---------- | ----- |
| `fetch`                                                | 6,603 ms   | 563   |
| `shaderSync`                                           | **980 ms** | 107   |
| unexplained main-thread block (GLB parse, scene graph) | **583 ms** | —     |
| `textureUpload`                                        | 132 ms     | 23    |
| `decode`                                               | 47 ms      | 15    |
| `bufferUpload`                                         | 18 ms      | 102   |
| idle                                                   | 603 ms     | —     |

**Only `fetch` is contaminated.** Those 563 requests are the dev server's
unbundled modules, not the production bundle. Every GPU and JS category above
is a real reading.

Reference point, Tauri desktop build, taken before the profiler existed:
assets 5,424 ms / compile 2,533 ms / settle **114 ms**. Re-measuring the
desktop numbers with the profiler requires a Tauri rebuild and has not been
done.

## Settled: do not re-propose these

### Texture cooking (KTX2 / Basis) does not help load time

Decode + upload is **179 ms of 7,700 ms** — 2.3%. Three independent methods
now agree. KTX2 also makes the download roughly 5x larger. Its only real win
is VRAM headroom, which is not the problem being solved.

If a future task genuinely needs VRAM relief on low-end mobile, that is a
different justification and must say so explicitly.

### WebGPU does not help load time

The dominant cost is the GPU driver building shader programs. WebGPU v1 has
no persisted pipeline cache, so the equivalent pipeline creation happens on
every launch there too. Same wait, plus a renderer migration.

### `renderer.debug.checkShaderErrors = false` saves nothing

This one nearly shipped. three.js `onFirstUse`
(`three.module.js:6895`) calls `getProgramInfoLog`, which blocks until the
driver finishes linking. It profiles at 1,240 ms across 39 programs, which
reads exactly like a one-line 1.2-second win.

A/B, stubbing the info-log calls to return instantly:

| Call                  | Baseline      | Info-log stubbed   |
| --------------------- | ------------- | ------------------ |
| `getProgramInfoLog`   | 1,240 ms / 39 | ~0                 |
| `getProgramParameter` | 18 ms / 256   | **1,135 ms / 280** |

The wait relocated. It is driver link time, and it does not disappear by
declining to ask for it. Any future "just skip the shader error check" patch
is this same non-fix; measure before believing it.

## Fixed 2026-09-02 — do not "fix" these again

Both leads below were investigated and closed. The numbers are same-machine
before/after on `/test/ocean-scene`, warm, page foregrounded.

| Phase   | Before             | After                |
| ------- | ------------------ | -------------------- |
| assets  | 2,842 ms           | 2,185 ms             |
| compile | 2,942 ms           | **673 ms**           |
| settle  | 1,590 ms, `capped` | **191 ms, `passed`** |

### The frame gate could not pass at 30fps

`DEFAULT_FRAME_GATE.frameBudgetMs` was 20 ms — under half a 30 fps frame — and
the gate wanted five consecutive frames inside it. A heavy scene settles at a
steady 30 fps, so the streak was unreachable and the boot paid the full 1,500 ms
cap as a flat delay with zero blocked time and zero GPU calls. Measured cadence
during settle: p50 33.3 ms, p90 33.4 ms, 34 of 53 frames over the old budget.

The budget is now 40 ms. At the identical 33.3 ms cadence the gate passes in
191 ms. It still resets on the 130 ms hitches it exists to hide.

A second defect: the cap was only tested when a frame arrived, and
`requestAnimationFrame` does not fire in a hidden document, so a scene booted in
a background tab waited on a cap that could never come. The settle loop in
`SceneShaderWarmup.svelte` now races the frame loop against wall-clock time.

Caveat worth keeping: on a machine already rendering at 60 fps the old gate
passed fine, so this fix buys nothing there. It is the 30 fps case — a heavy
scene, a phone, a loaded machine — that was paying 1.5 s.

### The shader warm-up awaited one program at a time

`warmupRenderer` ran `await renderer.compileAsync(...)` in a loop.
`compileAsync` (`three.module.js:16992`) does its traversal and program
creation synchronously and then returns a promise that polls
`KHR_parallel_shader_compile` on a **10 ms `setTimeout` chain**. Awaiting them
in turn therefore paid every driver link end to end _plus_ a poll tick per
program, with the GPU idle in between.

The calls are now dispatched together and awaited as a group. Same-server A/B,
three runs each: compile phase 1,615 / 2,103 / 1,695 ms → 240 / 216 / 293 ms.
The synchronous GL work is unchanged (~200 ms); what disappeared was the
waiting. `tests/unit/scene-boot/renderer-warmup.test.ts` pins the concurrency,
because serialization is invisible at runtime — it just takes longer.

## Still open

The **assets** phase still does ~1,000 ms of shader linking across ~125 calls
before the warm-up runs at all — programs linking at first draw as each mesh
mounts. Moving that work earlier, or reducing the distinct program count
(material variants, `defines` permutations), is the next lever. Not attempted.

## Scene switching, measured 2026-09-03

A scene switch is another complete boot, not a cheap background swap. The
renderer and canvas survive, but the outgoing environment unmounts and the
incoming Svelte/three.js scene graph is rebuilt. A 16 ms timer measured whether
the rest of the page could answer while that happened.

One first-visit pass through the production build produced these click-to-reveal
times. The machine was shared and loaded, so use the numbers to rank the scenes,
not as a release benchmark:

| Scene     |                                      Reveal | Longest UI stall | Dominant phase    |
| --------- | ------------------------------------------: | ---------------: | ----------------- |
| Cosmic    |                                       1.2 s |            0.6 s | cached/very light |
| Void      |                                       1.8 s |            1.2 s | shader compile    |
| Celestial |                                       3.0 s |            1.0 s | assets            |
| Forest    |                                       5.3 s |            1.4 s | assets            |
| Blossom   |                                       5.6 s |            2.1 s | assets + compile  |
| Rainbow   |                                       6.0 s |        **5.3 s** | shader compile    |
| Ember     |                                       6.7 s |            3.1 s | assets + settle   |
| Autumn    |                                       7.9 s |        **4.4 s** | shader compile    |
| Winter    |                                       9.1 s |            2.8 s | assets + compile  |
| Ocean     | exceeded the 60 s probe on this loaded pass |            2.9 s | assets            |

The shared transition now warms each environment's small JavaScript chunk when
its picker tile is pointed at or focused, warms decoder runtimes when the picker
exists, and freezes the unrelated animated page background until the switch
settles. These remove avoidable serial work and contention for every scene.
They do not make scene construction preemptible.

Two tempting follow-ups were measured and rejected:

- Fetching GLBs on tile hover doubled large model transfers. The same 12.3 MB
  Blossom model transferred once during hover and again during mount; files at
  12 MB and above repeatedly missed the preview server's cache.
- Yielding or batching the existing shader-warmup dispatch made the heaviest
  scene slower. Eight-target batches moved Ocean's median compile from 647 ms
  to 913 ms, and yielded per-target dispatch increased total switch time while
  leaving the real 1.3 s scene-mount task untouched.

The remaining multi-second stalls are inside individual environment mount and
GPU program creation calls. JavaScript cannot interrupt one of those calls once
it starts. Removing them requires scene-specific shader/material consolidation,
staged scene construction, or moving the renderer to an `OffscreenCanvas`
worker. Switching engines does not remove that architectural requirement; it
creates a second renderer and parity surface.

### Shader-dispatch slicing

Rainbow and Autumn showed a separate, reachable failure: multiple synchronous
program-creation calls accumulated inside one task before the async driver-link
promises were awaited. `warmupRenderer` now yields only after those dispatches
have consumed 50 ms. Fast scenes keep their contiguous path, while expensive
scenes let input and painting run between programs; every link promise remains
in flight and is still awaited as one group.

Three fresh-context runs after the change:

| Scene   | Previous longest stall | New longest stalls       |
| ------- | ---------------------: | ------------------------ |
| Autumn  |               4,264 ms | 1,343 / 1,258 / 1,299 ms |
| Rainbow |               5,218 ms | 1,696 / 2,531 / 1,735 ms |

This is a material reduction, not a zero-jank result. The remaining 1.3-2.5 s
calls are individually synchronous and cannot be split by yielding around them.
Ocean also remains dominated by its assets phase rather than this warm-up loop.

## Re-measuring

1. Open `https://localhost:5173/test/ocean-scene?bootprofile=1`. Any route
   that mounts `SceneShaderWarmup` works; routes that don't (e.g.
   `/test/forest-scene`) produce no spans and will read as all-nulls.
2. Read `window.__sceneBootProfile`, or the console report at reveal.
3. Say which run was cold and which was warm. They differ by ~2x.
4. State that `fetch` is dev-contaminated whenever quoting a dev-server run.

## OffscreenCanvas worker handoff, measured 2026-09-04

Yielding reduced the worst main-thread stalls, but it cannot interrupt one GLB
parse, Three.js scene-construction call, or GPU program-creation call after that
call begins. A two-slot `OffscreenCanvas` worker backend was therefore tested
against exact production Rainbow construction and real Ocean assets.

The active worker keeps presenting the outgoing world while a second worker
constructs and compiles the replacement. The main thread flips the two canvas
slots only after the incoming worker reports a rendered frame, then terminates
the outgoing worker. The bound is two WebGL contexts during preparation and one
at steady state.

Four alternating steady-state environment-only switches measured before the
performer moved into the worker:

| Incoming world | Click to swap | Worker preparation | Main-thread max gap | Outgoing-frame max gap |
| -------------- | ------------: | -----------------: | ------------------: | ---------------------: |
| Ocean          |        745 ms |             572 ms |             17.8 ms |                16.8 ms |
| Rainbow        |        564 ms |             361 ms |             17.5 ms |                66.7 ms |
| Ocean          |        797 ms |             609 ms |             17.1 ms |                16.8 ms |
| Rainbow        |        580 ms |             393 ms |             20.3 ms |                66.7 ms |

The exact Rainbow scene graph is now shared by its Svelte adapter and worker
adapter through `environments/worlds/rainbow/`; the worker result is not a
cheaper visual stand-in. The first cold Rainbow development load still produced
a 102.9 ms application-thread gap, so cold startup has not met the 50 ms input
gate. Steady switching did.

The next checkpoint moved a real X-Bot, its IK/finger solve, and two live staffs
into the same worker-owned frame as the exact Rainbow world. Across sixteen
alternating complete-frame switches, median click-to-swap was 2,112 ms into
Ocean and 1,735 ms into Rainbow. Thirteen of sixteen stayed inside the 50 ms
application-thread gate. All sixteen stayed inside the 100 ms outgoing-frame
continuity gate, although one interval reached 50.1 ms instead of the usual
16.8-17.5 ms. Context count was two at handoff and one after cleanup on every
observed switch.

This remains an architectural proof, not a production-viewer claim. The
shipping viewer still renders on the main thread. Rainbow has exact world,
performer, staff-family prop, and shared-lighting ownership in the worker;
Ocean is representative, and locomotion, turns, contact locking, non-staff
props, effects, picking, badges, grids, and postprocessing remain outside the
worker boundary. A background-only worker canvas is still forbidden because
it loses shared depth, fog, lighting, occlusion, and postprocessing with the
performer.

Do not call this flawless. Three of sixteen complete-frame switches missed the
input gate. The worker architecture has removed the multi-second main-thread
freeze as the normal behavior, but the remaining scheduler/GPU outliers and
full production parity are open work.

Canonical design and acceptance gates:
`docs/superpowers/specs/2026-09-03-worker-renderer-scene-switch-prototype-design.md`.

## Persistent production worker, measured 2026-09-04

The production sequence viewer now routes all ten exact environments through
one persistent worker renderer. An ordinary scene switch keeps one worker and
one WebGL context from request through presentation; a bitmap poster holds the
last complete frame while the next world replaces only scene-owned resources.
The same frame owns performers, all canonical prop families, effects, markers,
lighting, and postprocessing. Record Scene is the intentional exception and
uses the legacy renderer because capture requires renderer/scene/camera/frame
handles on the application thread.

One persistent-session sweep exercised Autumn, Blossom, Celestial, Cosmic,
Ember, Forest, Ocean, Rainbow, Void, and Winter. Every switch finished with one
worker, one render canvas, one poster canvas, no renderer fallback, no worker
error, and a complete presented frame. `rendererMs` was zero on every switch
after the first, proving the renderer and context were reused. Grouping shader
prime work into batches of eight reduced repeated prime time from about 1.16 s
to 0.31 s in Cosmic and from about 1.47 s to 0.25 s in Winter in the measured
runs.

The first persistent implementation still performed a recursive
`$state.snapshot` of the complete performer/effect transport graph every
application frame, immediately before `postMessage` cloned it again. A
production trace, filtered to the tested page's renderer process, attributed
1.51 s of sampled self time to that Svelte snapshot recursion. The transport
now keeps complete snapshots as raw immutable values and lets `postMessage` own
the single clone. A separate renderer process from another open test page also
contained a 4.77 s task; do not attribute that task to this viewer.

The worker does not make asset preparation instantaneous. On the heavily
loaded shared verification machine, exact Ocean and Forest construction still
produced application-timer gaps of roughly 1.3-1.4 s in foreground runs, and a
later Ocean trace observed a 4.82 s timer gap while other browser sessions were
also busy. These numbers describe that machine state, not an established
single-scene CPU cost. Do not call scene switching flawless until an isolated
production run passes the 50 ms application-input gate for the heavy worlds.

Rapid selection cancels stale, non-abortable preparation by restarting the
exceptional worker/context under the already-visible poster. Ordinary switches
continue to reuse the persistent context. This prevents an abandoned Ocean
parse from delaying a later Void choice while preserving the one-context
steady-state ceiling.

## Related

- `src/lib/shared/3d/scene-boot/` — the boot window's owners
- `docs/architecture/canonical-capabilities.md` — scene-boot routing row
- `.claude/rules/verification-protocol.md`, `.claude/rules/no-assumption-without-evidence.md`
- Historical personal-memory reference: `memory/reference_scene_boot_cost_measured.md` (location unestablished in this tree).
