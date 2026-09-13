# Fire emitter lifecycle across a prop switch

Feedback `eqFBtgUrvgRsyXFEQaRf` — "with fire active, switching from a fire-capable
prop to hands leaves persistent fire stuck on the animation canvas; existing fire
should fade naturally."

- Branch: `claude/fire-emitter-prop-switch-cleanup-7qzzfl`
- Base SHA: `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main` at session start)
- Final SHA: see the branch head; the fix commit is `c887a127` plus the fade-window
  refinement and this report.

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
timer, the renderer keeps a scalar estimate of the heat left in the field:
reset to `FIRE_RESIDUAL_PEAK_HEAT` on every emitting frame, then multiplied by the
solver's own `computeFireTemperatureDissipation()` value once per sub-step when
nothing is emitting. It stops at the display shader's own visibility gate —
everything that paints a pixel lives inside
`if (fireIntensity > 0.1)` in `FIRE_DISPLAY_FRAG`, where
`fireIntensity = (temp + fuel * 0.5) * displayIntensity` — so the fade ends
exactly where the pass goes dark, and a brighter configuration fades for longer
because a colder field is still visible to it. Sub-steps rather than seconds
means reduced motion, deterministic export dt and long frames all track
correctly.

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
→ 2 files, 14 tests passed
```

Fails before the fix, passes after. With only the render-loop change reverted
(`git stash push -- animation-render-loop.ts`), **5 of the 7** render-loop tests
fail:

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

- The browser evidence drives the renderer directly, not the assembled animation
  UI; the end-to-end prop switch in the real app was not observed from here.
- The fade window is an estimate, deliberately conservative: it starts from a
  peak-heat headroom of 4 against a real peak that is lower, so it outlives the
  visible plume (measured: fire invisible by frame ~80, simulation stops at frame
  130). Truncating a live plume is the failure mode worth avoiding; an extra
  ~0.8 s of a 128×128 solve is not.
- Charcoal's fade shares the loop change and has unit coverage, but was not
  measured in the browser.
- The pre-existing repo-wide `check:fast` baseline (582 errors) was not
  investigated; it is identical with and without this branch.
