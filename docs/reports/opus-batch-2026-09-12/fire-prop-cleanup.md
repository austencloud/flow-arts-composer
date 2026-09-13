# Fire emitter lifecycle across a prop switch

Feedback `eqFBtgUrvgRsyXFEQaRf` — "with fire active, switching from a fire-capable
prop to hands leaves persistent fire stuck on the animation canvas; existing fire
should fade naturally."

- Branch: `claude/fire-emitter-prop-switch-cleanup-7qzzfl` — PR
  [#51](https://github.com/austencloud/tka-platform/pull/51)
- Base SHA: `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main` at session start)
- Commits: `c887a127` (lifecycle fix), `a00d3169` (fade window at the display
  gate), then the cadence correction below.

## Correction after independent review (HOLD on `a00d3169`)

The review was right, and its numbers reproduce exactly. The first version of
the residual estimate decayed by `dissipation ** subSteps` — one full unit of
decay per sub-step. The solver does not do that: `advect` runs its dissipation
through `computeFluidStepDissipation`
(`services/fluid/web-gl-fluid-solver-2d.ts:167-171`), which raises the base to
`dt / (1/60)`, and the renderer feeds it the real `subDt`. The two agree only
when `subDt` is exactly 1/60, which is why 60Hz measured clean and nothing else
was measured.

Estimate vs. real field at the frame the old code called the fade finished
(peak 4, base 0.972, floor 0.1):

| Cadence | subDt | subSteps | settles at | estimate | real field | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 60Hz | 0.01667 | 1 | frame 130 / 2.167s | .0997 | .0997 | correct |
| 120Hz | 0.00833 | 1 | frame 130 / 1.083s | .0997 | **.6315** | plume deleted |
| 144Hz | 0.00694 | 1 | frame 130 / 0.903s | .0997 | **.8590** | plume deleted |
| reduced motion 60Hz | 0.00333 | 1 | frame 130 / 2.167s | .0997 | **1.9115** | plume deleted |
| reduced motion 120Hz | 0.00167 | 1 | frame 130 / 1.083s | .0997 | **2.7652** | plume deleted |
| 30Hz | 0.01667 | 2 | frame 65 / 2.167s | .0997 | .0997 | correct |

So on a 120Hz or 144Hz display, or for any user with reduced motion on,
`clearSimulation()` wiped a plume that was still plainly burning — a worse
artifact than the frozen frame this branch set out to fix. 30Hz survived only
because its two sub-steps happen to cancel the error.

**The correction**: `decayResidualHeat` now takes the renderer's real
`subDtSeconds` and `subSteps` and calls `computeFluidStepDissipation` itself, so
the estimate cools at exactly the rate the temperature field does. Reusing the
solver's own function rather than a second copy of the law is the point — a
future change to how dissipation is normalized moves both together.

`computeFireSubStepping()` is now the single owner of the frame → sub-step
split; `stepSimulation` and the estimate both read it, and tests drive the real
arithmetic instead of restating `0.017` and the ceil.

## Root cause

Three facts compose into the defect. All three are code-level, and the third was
measured in a real WebGL2 context (see Evidence).

1. `hand` maps to an empty tip-point table —
   `src/lib/shared/animation-engine/domain/types/prop-tip-points.ts:463`
   (`hand: EMPTY_TIP_POINTS`). This is the existing prop capability
   classification; no new type was invented. `FireTipTracker` therefore emits
   zero tips for a hand, so switching **both** props to hands removes every
   fire-carrying tip in one frame. (Contact balls are classified the same way.)
2. The render loop gated the fire and charcoal renderers on having tips:
   `animation-render-loop.ts`, previously
   `if (activeFireRenderer && fireTips.length > 0)`. With no tips, `renderFire()`
   was never called again.
3. The fire canvas is a WebGL2 context created with
   `preserveDrawingBuffer: true` (`web-gl-fire-renderer.ts:418`). Nothing clears
   it when the loop stops drawing, so the **last frame the renderer ever drew
   stays composited on the animation canvas indefinitely**. Charcoal has the
   same context flag and the same gate.

Nothing else clears the canvas on a prop switch: fire's enablement comes from
`hasEffectInMap(tipEffectMap, "fire")`
(`services/managers/effect-system.ts:179`), which is unaffected by prop type, so
the keep-warm `parkWarm()` path that *does* hard-clear never fires here.

## What changed

Owned files:

| File | Change |
| --- | --- |
| `src/lib/shared/animation-engine/services/fire/fire-emitter-fade.ts` | **new** — pure residual-heat math for the post-emission fade |
| `src/lib/shared/animation-engine/services/fire/web-gl-fire-renderer.ts` | residual-heat tracking, `hasResidualFire()`, frame-cache drop on emission stop, one terminal clear |
| `src/lib/shared/animation-engine/services/charcoal/charcoal-spark-renderer.ts` | `hasActiveParticles()` |
| `src/lib/shared/animation-engine/services/animation-render-loop.ts` | keep driving a renderer that still holds live fire/sparks, with an empty tip list |
| `src/lib/shared/animation-engine/services/fire/fire-emitter-fade.test.ts` | **new** |
| `src/lib/shared/animation-engine/services/__tests__/render-loop-fire-prop-switch-fade.test.ts` | **new** |

The loop now calls `renderFire({...input, tips: []})` while
`hasResidualFire()` is true. `stepSimulation()` with an empty tip list builds no
splats (`web-gl-fire-renderer.ts:1058` — the splat loop is over `tips`) but still
runs advection, buoyancy, vorticity, combustion and the pressure solve, so the
plume ages out through the same physics it always used. `renderDisplay()` repaints
every frame, so the canvas tracks the fade instead of holding a still.

**Knowing when to stop** is the only new judgement. Rather than a wall-clock
timer, the renderer keeps a scalar estimate of the heat left in the field: reset
to `FIRE_RESIDUAL_PEAK_HEAT` on every emitting frame, then, when nothing is
emitting, decayed through the solver's own
`computeFluidStepDissipation(temperatureDissipation, subDt)` once per sub-step —
the identical call `advect` makes, with the renderer's real `subDt` and
`subSteps` from `computeFireSubStepping()`. That is what keeps the estimate
honest at any refresh rate, any playback speed, under reduced motion and on the
export's fixed dt; assuming a flat unit of decay per sub-step is the defect the
review caught.

It stops at the display shader's own visibility gate — everything that paints a
pixel lives inside `if (fireIntensity > 0.1)` in `FIRE_DISPLAY_FRAG`, where
`fireIntensity = (temp + fuel * 0.5) * displayIntensity` — so the fade ends
exactly where the pass goes dark, and a brighter configuration fades for longer
because a colder field is still visible to it.

When the estimate reaches zero the renderer calls `clearSimulation()` once (which
also blanks the visible framebuffer) and `hasResidualFire()` goes false, so an
idle fire canvas costs nothing — a prop that never had fire is never driven at
all.

### Deliberately not done

- **No hard clear on prop selection.** The only clear in the whole lifecycle is
  the renderer's own, once its field is empty and nothing visible is left.
  Switching back to a fire-capable prop mid-fade simply re-arms the emitter, so
  the dying plume and the new flame overlap instead of popping.
- **No frozen simulation.** The solver keeps stepping through the fade; only
  emission stops.
- **Frame cache dropped when emission stops.** The cache only ever records
  emitting frames, so a warm cache would have replayed the burning loop forever
  and the plume would never have faded. `renderFire()` now takes the cache path
  only while emitting, and invalidates a recording/warm cache otherwise. Verified
  in the browser (below).

## Cases traced

| Case | Behaviour |
| --- | --- |
| Both props → hands | Every tip disappears; fade runs, canvas ends transparent |
| One prop → hands | Other hand keeps emitting; the dropped hand's flame ages out inside the same simulation (tips go 4 → 2). This path already worked |
| Hands → fire-capable prop mid-fade | Emitter re-arms, no clear, no pop |
| Paused | The rAF loop stays alive while `fireConfig` is set (`anyEffectActive` at `animation-render-loop.ts:1192-1204` is config-based, not `isPlaying`-based) and the rAF clock keeps advancing, so a swap on a paused canvas fades the same way |
| `stop()` / effect turned off | Unchanged: `parkWarm()` still hard-clears, which is correct for an explicit "fire off" |
| Multiple performers | Each animation instance owns its own loop + renderer; residual state is per-instance. Covered by a test with two loops |
| Gap detected (tab switch, HMR) | Unchanged: `clearSimulation()` first, which now also zeroes the residual estimate |
| Prop that never had fire | `hasResidualFire()` is false from construction, so the renderer is never driven |
| Export / QR-video worker paths | `worker-effect-renderer.ts` and `video-trails/WorkspaceView.svelte` call `renderFire` every frame with their own tips; they never hit the empty-tip path while emitting, so behaviour is unchanged |

## Evidence

### Focused tests (measured)

```
npx vitest run --config tests/config/vitest.config.ts \
  src/lib/shared/animation-engine/services/fire/fire-emitter-fade.test.ts \
  src/lib/shared/animation-engine/services/__tests__/render-loop-fire-prop-switch-fade.test.ts
→ 2 files, 31 tests passed
```

Both suites now drive cadence explicitly. `fire-emitter-fade.test.ts` runs a
reference field written from the solver's documented law
(`base ** (60 * subDt * subSteps)`, derived independently of the estimate's
code) alongside the estimate, at 60/120/144/30Hz and under reduced motion at
60/120Hz, and asserts the estimate never reaches zero while that field is still
above the display gate. `render-loop-fire-prop-switch-fade.test.ts`'s fake
renderer now derives its sub-step shape from the frame dt the loop hands it via
`computeFireSubStepping`, instead of a fixed decay per call, so a loop test at
120Hz or under reduced motion exercises the cadence the renderer would see.

Restoring the pre-correction law (`perSubStep = base`, ignoring `subDt`) fails
**13 of 31**, with the review's exact numbers:

```
× does not clear a still-visible plume at '120Hz'                 expected 0.6314910671174816 to be <= 0.1
× does not clear a still-visible plume at '144Hz'                 expected 0.8589792538478577 to be <= 0.1
× does not clear a still-visible plume at 'reduced motion 60Hz'   expected 1.9115377513535876 to be <= 0.1
× does not clear a still-visible plume at 'reduced motion 120Hz'  expected 2.7651674461801394 to be <= 0.1
× holds the estimate above the floor while the field is visible at '120Hz' / '144Hz' / both reduced-motion cases
× takes the same wall-clock fade at 60Hz and 120Hz                expected 130 to be greater than 234
× fades roughly five times slower under reduced motion            expected 1 to be greater than 4
× drives the fade for the same simulated span at '120Hz' / '144Hz' / 'reduced motion 60Hz'
✓ every 60Hz and 30Hz case                                        (the cadences the old law got right)
```

The original lifecycle regression still holds too. With only the render-loop
change reverted (`git stash push -- animation-render-loop.ts`), **5 of the
original 7** render-loop tests fail:

```
× keeps driving the fire renderer with no tips so live fire ages out   expected 5 to be 6
× resumes emission when a fire-capable prop comes back mid-fade        expected false to be true
× fades sparks the same way when charcoal owns the tips                expected 0 to be greater than 1
× fades independently per performer                                    expected false to be true
× keeps fading while playback is paused                                expected 3 to be 13
✓ fades the hand that lost its prop while the other hand keeps burning  (already worked)
✓ does not start driving a renderer that never had fire                 (already worked)
```

The GL work cannot run under jsdom, so the loop test uses fakes that reproduce
the renderers' residual-state contract; the decay math itself is tested directly,
and the real renderer is covered by the browser checks below.

Wider regression sweep (measured):

```
npx vitest run --config tests/config/vitest.config.ts \
  src/lib/shared/animation-engine/ src/lib/shared/qr-video/ \
  src/lib/features/video/ src/lib/shared/effects/
→ 54 files, 444 tests passed
```

`npm run check:fast`: 582 errors / 44 warnings **both with and without** this
branch's changes (identical pre-existing baseline, measured by stashing). None of
them are in the changed files.

### Real WebGL2 in the cloud browser (measured)

Chromium (`/opt/pw-browsers/chromium-1194`) with ANGLE/SwiftShader, driving the
**real `WebGLFireRenderer`** through a Vite dev server on a task-owned port 5199.
`readPixels` on the fire canvas's default framebuffer:

| Stage | Result |
| --- | --- |
| Burning (2 moving tips, 91 frames) | total alpha `6,339,729`, max RGB 255 |
| 180 frames with `renderFire` **not called** (the old behaviour) | total alpha `6,339,729` — **byte-identical**: the frame is frozen, which is the reported symptom |
| Fade, empty tip list | 130 frames (2.17 s); visible fire (max RGB) already 0 by frame 80 |
| Settled | total alpha `0`, `residualHeat` `0` |
| Re-lit with tips | total alpha `6,352,290` |

Warm-cache adversarial case (measured): after three recorded loops the cache
reports `state: "warm"` with 40 frames; once the tips are removed it goes
`state: "idle"` and the canvas fades to alpha 0 in 130 frames rather than
replaying the burning loop.

### Cadence, in the real renderer, before and after the correction (measured)

Same instrument, four cadences, Playwright `emulateMedia({ reducedMotion })` for
the reduced-motion rows. "last live frame" is the fire canvas sampled on the
final frame the renderer still claimed residual fire — i.e. the frame
immediately before `clearSimulation()`. A non-zero `maxRGB` there means visible
fire was wiped.

| Cadence | fade frames | fade seconds | plume dark by | last live frame maxRGB |
| --- | --- | --- | --- | --- |
| **After** 60Hz | 130 | 2.167 | frame 68 | 0 |
| **After** 120Hz | 260 | 2.167 | frame 164 | 0 |
| **After** 144Hz | 312 | 2.167 | frame 205 | 0 |
| **After** reduced motion 60Hz | 650 | 10.833 | frame 385 | 0 |
| **Before** 60Hz | 130 | 2.167 | frame 68 | 0 |
| **Before** 120Hz | 130 | 1.083 | — | **14** |
| **Before** 144Hz | 130 | 0.903 | — | **138** |
| **Before** reduced motion 60Hz | 130 | 2.167 | — | **255** |

Under reduced motion the old code cleared the canvas while the plume was at full
white (255). After the correction every cadence settles on the same 2.167s of
*simulated* time — 10.83s under reduced motion, which is 5x because the sim
itself runs at 0.2x — and in every case the plume is already dark before the
renderer stands down.

Reproduction (scripts were task-owned and not committed; port 5199, not 5173):

```bash
npx vite --port 5199 --strictPort &
node - <<'JS'   # playwright, executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome
// goto http://localhost:5199/, wait for the dev boot reload, then in-page:
//   const { WebGLFireRenderer } = await import(
//     "/src/lib/shared/animation-engine/services/fire/web-gl-fire-renderer.ts");
//   initialize into a 256x256 container, renderFire(tips) ~90 frames,
//   then renderFire(tips: []) while renderer.hasResidualFire(),
//   reading gl.readPixels on the default framebuffer at each stage.
JS
```

### Mounted-pipeline proof — attempted, NOT achieved

The review asked for mounted `/lab/effects` or quick-viewer visual proof, since
the renderer-level evidence only exercises the renderer. I could not produce it
in this container. What was attempted, and what each attempt established:

1. **`/lab/effects` in the cloud browser** — boots, then redirects away. The lab
   module is `adminOnly`, and this container's egress blocks Firebase:
   `ERR_TUNNEL_CONNECTION_FAILED` on `firestore.googleapis.com` and
   `the-kinetic-alphabet-default-rtdb.firebaseio.com`, so auth never resolves
   and the route lands on the composer instead.
2. **Mounting the real `CanvasSurface` directly** (Svelte 5 `mount()` with a
   `proxy()` props object, dev-server module URLs). This *worked as a mount*:
   the real AnimationEngine, EffectRendererManager, FireTipTracker,
   AnimationRenderLoop and WebGLFireRenderer all came up, and the surface
   rendered two staffs with fire burning at all four tips
   (`.wt-mounted-1-burning.png`, not committed). Read through the render-context
   registry, the mounted fire renderer reported `activeTips: 4`,
   `residualHeat: 4` (peak), `hasResidualFire: true` — so the residual
   bookkeeping is live in the mounted path.
3. **Driving the prop switch through that mount** — this is what failed. Setting
   `leftPropType`/`rightPropType` to `"hand"` on the props object reads back as
   `"hand"` but never reaches the engine: `activeTips` stayed at 4. Driving the
   engine's own `renderFrameSync` with `leftPropType: "hand"` did not move it
   either, because the mounted component's own rAF loop keeps re-asserting its
   props each frame. Prop type reaches the tip tracker via PropTypeManager's
   async texture/crossfade path, which a parent component drives and an
   out-of-app mount does not.

So: **the fade path is proven at the renderer and at the render loop; that a
prop switch in the assembled app reaches it is not proven here.** The
render-loop tests cover the loop's half of that seam with the real
`FireTipTracker` and real `getTipPoints("hand")`, which is the mechanism, but it
is not the same as watching the app.

### Verification route for Austen

Local dev: [https://localhost:5173/lab/effects](https://localhost:5173/lab/effects)
— Effects Lab. Assign fire to the tips, play, then switch a prop to **Hand** in
the prop controls. Expected: the flame keeps burning where it is and dies out
over roughly two seconds; the canvas is then clean. Switching back to the prop
mid-fade re-lights without a flash or a pop. The same sequence on a paused canvas
behaves identically.

The same check applies anywhere the animation canvas has a prop selector (the
sequence viewer's quick-viewer prop selection is the surface the feedback came
from). Not run here: this session has no access to Austen's dev server, and the
cloud browser exercised the renderer directly rather than the assembled UI.

## Separate finding — NOT fixed (pre-existing, outside this task's scope)

While measuring the fade I found a pre-existing defect in the fire **bloom**
path. It is reported here rather than changed, because it alters fire's
appearance everywhere and is not emitter-lifecycle work.

`BLOOM_DOWNSAMPLE_FRAG` writes `fragColor = vec4(rgb, 1.0)` — alpha hard-coded
to 1 regardless of how much light passed the prefilter — and the upsample chain
accumulates additively (`gl.blendFunc(ONE, ONE)`, `web-gl-fire-renderer.ts:1744`)
across a fixed 4-mip chain. Measured: for a **completely empty** fire field,
bloom mip 0 comes back with `alpha = 4.0` and `rgb ≈ 0.0004`. The composite then
does `combined = scene + bloom * u_bloomStrength` with
`bloomStrength = 0.08` (nothing in production ever sets
`fireConfig.bloomStrength`, so the `?? 0.08` default always applies), giving
`alpha = 0.32` — `82/255` — **uniformly over the entire fire canvas**, with
RGB 0.

Visually confirmed: the fire canvas over a white stage renders `#ABABAB`; after
`clearSimulation()` it is pure white. So while fire is enabled, the whole fire
canvas area is washed 32% black over whatever is beneath it — including the
props, which sit under the fire canvas (`zIndex 4`). It is size-independent (the
mip chain is a fixed 4).

This is likely part of what "persistent fire stuck on the canvas" looked like:
after the prop switch the frozen frame carried this wash too. **The fix in this
branch removes it at the end of the fade** (the terminal `clearSimulation()`
blanks the canvas), but it returns whenever fire renders again.

A fix is not a one-liner: the tone-mapped composite divides by `combined.a` and
re-multiplies, so bloom alpha is load-bearing for making a halo visible where the
scene alpha is near zero. The right change is for the downsample to write an
alpha derived from the light that actually passed the prefilter (e.g. the Karis
luma) rather than a constant 1, then re-check the halo against a dark
background. That is a fire-look change and wants Austen's eye.

## Limitations

- **Mounted visual proof is still outstanding** — see the section above for what
  blocked it and what was established instead. This is the one piece of the
  review's correction list not closed here.
- The fade window is an estimate, deliberately conservative: it starts from a
  peak-heat headroom of 4 against a real peak that is lower, so it outlives the
  visible plume at every cadence measured (60Hz: dark at frame 68, stops at 130;
  144Hz: dark at 205, stops at 312). Truncating a live plume is the failure mode
  worth avoiding; an extra fraction of a second of a 128×128 solve is not.
- Reduced motion now fades for ~10.8s of wall clock. That is the field genuinely
  cooling at 0.2x, and it is what the user sees, but it is a longer tail of GPU
  work than before. If that is judged too long, the right lever is the sim's
  reduced-motion dt scale, not the fade estimate.
- Charcoal's fade shares the loop change and has unit coverage, but was not
  measured in the browser, and its particle ageing is not dt-normalized the same
  way fire's field is — it integrates `stepDt` directly, so the cadence defect
  fixed here does not apply to it.
- The pre-existing repo-wide `check:fast` baseline (582 errors) was not
  investigated; it is identical with and without this branch.
