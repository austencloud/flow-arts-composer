---
status: backlog
value: 2
effort: M
remaining: Reconcile the removed MandalaViewerControls target with current MandalaControlDock/MeditationControls, then verify whether phase-2 trails already exist.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Mandala Trails / Afterimage — Phase 2 Design Spec

> **DRIFT WARNING — 2026-08-02.** Verified 2026-08-02. The named integration target `MandalaViewerControls.svelte` is GONE (0 repo matches) — the detector reads commit traffic on mandala paths as progress on this spec, but that traffic belongs to the control-dock consolidation that replaced the target. Feature itself remains unbuilt; re-scope onto `MandalaControlDock.svelte` / `MeditationControls.svelte` first.
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state.


**Date:** 2026-05-25
**Status:** Draft
**Roadmap:** Phase 2 of `docs/superpowers/specs/2026-05-25-mandala-roadmap.md`

---

## Overview

Ghost N previous mandala frames at decreasing opacity behind the current frame. As the mandala breathes (tipDx oscillates via easing), each frame leaves a luminous afterimage that fades out on an exponential curve. The result is a long-exposure photography effect — the mandala writes light trails through the air.

The effect is especially striking in Flow mode: because `colorPhase` advances continuously, each ghost frame was rendered with a slightly different palette. The stacked ghosts produce a rainbow smear that rotates with the current color phase — not a static color, but a living chromatic memory.

This is a renderer-level enhancement to `MandalaPane`. The existing `SequenceMandala` component and `renderMandalaSVG` service are unchanged. All state lives in `MandalaPane` and the new ghost-buffer mechanism.

---

## Architecture

### Ghost Frame Buffer

`MandalaPane` maintains a fixed-length circular buffer of previous render snapshots. Each entry captures the complete information needed to reproduce the rendered frame exactly as it appeared:

```typescript
interface GhostFrame {
  /** Monotonically increasing ID assigned at capture time — used as the {#each} key */
  id: number;
  /** The rendered SVG string — same output renderMandalaSVG produced at capture time */
  svgString: string;
  /** CSS rotation angle at capture time (degrees) */
  rotationDeg: number;
}
```

Opacity is computed at render time from the ghost's index in the buffer (`opacity = BASE_OPACITY * DECAY_RATE^i`, where `i = 0` is the most recent ghost). This is O(N) work that Svelte performs during the `{#each}` render pass regardless. Storing opacity on the struct is avoided because it produces a visual pop: every time a new ghost pushes in, all existing ghosts would jump to a lower opacity index in one frame (a 38% brightness drop at DECAY_RATE = 0.62).

### Buffer Management

```typescript
// In MandalaPane.svelte
let trailLength: number = $state(8);          // user-configurable: 3–15
let trailEnabled: boolean = $state(false);
let ghostBuffer: GhostFrame[] = $state([]);   // length <= trailLength
```

On each `requestAnimationFrame` tick (the existing `colorRafId` loop in Flow mode, or a new shared RAF in Solid mode), when `trailEnabled` is true:

1. Capture the current `svgString` and `rotationDeg` from `SequenceMandala`'s reactive state.
2. Assign opacity using the falloff curve (see below).
3. Push to the front of the buffer.
4. If `ghostBuffer.length > trailLength`, discard the tail.

The current live frame is always rendered by `SequenceMandala` at full opacity. Ghost frames are rendered in a separate stacking layer behind it.

### Sampling Rate

The ghost buffer does not need to sample every animation frame. At 60 fps with a 5-second breath period, one sample every 3–4 frames is visually indistinguishable from one per frame but keeps the SVG DOM shallow. The recommended sampling interval is 80ms (approximately 5 fps for the ghost layer), configurable as a constant.

An alternative is to sample every N degrees of rotation or every N units of tipDx change — i.e., sample on motion, not time. This produces denser ghosts during fast motion and sparser ghosts during slow motion, which looks more physically accurate. The implementation uses a simple position threshold: capture a new ghost if `|currentTipDx - lastGhostTipDx| > MIN_DX_DELTA` (suggested: 8 units) OR if `|currentRotation - lastGhostRotation| > MIN_ROT_DELTA` (suggested: 3 degrees). Whichever triggers first causes a capture.

### Opacity Falloff

Two options are practical. Exponential is strongly preferred for the "glow that dissipates" character:

**Exponential (default):**
```
opacity[i] = BASE_OPACITY * Math.pow(DECAY_RATE, i)
```
where `i` = 0 is the most recent ghost, `i = trailLength - 1` is the oldest.

Recommended defaults:
- `BASE_OPACITY = 0.45` — the freshest ghost is visible but clearly secondary to the live frame
- `DECAY_RATE = 0.62` — each successive ghost is 62% as bright as the previous (cuts to ~1% by ghost 8)

This produces a natural luminance fall-off: `0.45, 0.28, 0.17, 0.11, 0.07, 0.04, 0.025, 0.015`.

**Linear (alternative, not default):**
```
opacity[i] = BASE_OPACITY * (1 - i / trailLength)
```

Linear produces a more even smear — less "glow", more "motion blur". Exposing this as a hidden developer toggle is fine; it does not need to be a user-facing option.

### Rendering the Ghost Stack

The ghost frames render as absolutely-positioned divs stacked behind the live `SequenceMandala`. The mandala-stage uses flexbox centering and requires `position: relative` (added below) to contain the ghost layer. The ghost layer uses `position: absolute` with `pointer-events: none`.

```svelte
<!-- In MandalaPane template, inside .mandala-stage, before the live-frame wrapper -->
{#if trailEnabled}
  <div class="ghost-layer" class:dark-bg={bgLuminance < 0.2} aria-hidden="true">
    {#each ghostBuffer as ghost, i (ghost.id)}
      <div
        class="ghost-frame"
        style:opacity={BASE_OPACITY * Math.pow(DECAY_RATE, i)}
        style:transform="rotate({ghost.rotationDeg}deg)"
      >
        {@html ghost.svgString}
      </div>
    {/each}
  </div>
{/if}
<!-- Live frame is wrapped in a rotating div so MandalaPane drives rotation under Option B -->
<div style:transform="rotate({currentRotationDeg}deg)">
  <SequenceMandala {sequence} animate={false} tipDx={animatedDx} ... />
</div>
```

CSS:
```css
/* .mandala-stage must have position: relative to contain absolutely-positioned ghost layers */
.mandala-stage {
  position: relative;
}

.ghost-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.ghost-frame {
  position: absolute;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* No will-change: opacity — ghost opacity is a static value set once per render, not animating */
}

/* Dark-background enhancement: mix-blend-mode: screen produces a physically correct
   long-exposure / luminous accumulation effect — ghosts brighten each other at overlap
   zones rather than mudding to grey. The screen formula (1-(1-a)(1-b)) mirrors how
   light accumulates on photographic film.
   Only activate on dark backgrounds (luminance < 0.2). On light backgrounds, screen
   blending inverts (ghosts go darker), so fall back to normal opacity blending.
   MandalaPane derives bgLuminance from bgColor at render time and adds/removes the
   class conditionally. */
.ghost-layer.dark-bg .ghost-frame {
  mix-blend-mode: screen;
}
```

### Flow Color Interaction

Each ghost SVG string was produced by `renderMandalaSVG` with the palette and gradient colors that were current at capture time. Because `colorPhase` advances continuously and the palette is derived from `colorPhase`, each ghost has a distinct hue. There is no additional color logic needed — the rainbow trail emerges automatically from the temporal stacking of palettes.

### Rotation Interaction

Each ghost's `rotationDeg` is captured at snapshot time. The ghost divs are positioned outside `SequenceMandala`, so ghost rotation is applied at the `ghost-frame` div level via `style:transform="rotate({ghost.rotationDeg}deg)"`.

Under Option B (`animate={false}`), `SequenceMandala`'s internal RAF stops, so `rotationDeg` inside the component stays at 0. **`MandalaPane` must also drive the live frame's rotation.** The live `SequenceMandala` is wrapped in a `<div style:transform="rotate({currentRotationDeg}deg)">`, where `currentRotationDeg` is the same value computed by `MandalaPane`'s RAF tick and used for ghost capture. Both the live frame and the ghost frames rotate from a single source of truth in `MandalaPane`.

---

## UI Controls

Two additions to `MandalaViewerControls.svelte`.

### Trails Toggle

A new control group, placed immediately after the Breathe (play/pause) row:

```
[Trails toggle chip]  Trails
```

Same `chip transport-chip` pattern as the Breathe toggle:

```svelte
<div class="control-group">
  <div class="transport-row">
    <button
      type="button"
      class="chip transport-chip"
      class:active={trailEnabled}
      onclick={() => onTrailEnabledChange(!trailEnabled)}
      aria-label={trailEnabled ? "Disable trails" : "Enable trails"}
      aria-pressed={trailEnabled}
    >
      <i class="fas fa-ghost" aria-hidden="true"></i>
    </button>
    <span class="setting-label">Trails</span>
  </div>
</div>
```

Icon: `fa-ghost` (FontAwesome solid). The ghost pun is appropriate.

### Trail Length Slider

Rendered only when `trailEnabled` is true. Placed immediately below the Trails toggle:

```svelte
{#if trailEnabled}
  <div class="control-group">
    <div class="slider-row">
      <span class="setting-label">Length</span>
      <input
        type="range"
        min="3"
        max="15"
        step="1"
        value={trailLength}
        oninput={(e) => onTrailLengthChange(Number((e.target as HTMLInputElement).value))}
        class="slider"
      />
      <span class="slider-value">{trailLength}</span>
    </div>
  </div>
{/if}
```

Range: 3–15 ghosts. Default: 8. This satisfies the "5–15 range" target from the roadmap while leaving room for shorter trails that emphasize individual frames over blur.

### Props Interface Changes

`MandalaViewerControls` adds two new props and callbacks:

```typescript
trailEnabled: boolean;
trailLength: number;
onTrailEnabledChange: (v: boolean) => void;
onTrailLengthChange: (v: number) => void;
```

`MandalaPane` adds corresponding state and wires them through.

---

## Implementation Details

### Shared RAF Coordination

`MandalaPane` currently has a dedicated `colorRafId` RAF loop for Flow color mode. The ghost buffer needs to sample on the same tick. Rather than a second RAF loop, the existing Flow RAF loop is generalized into a shared animation tick that handles both color phase advancement and ghost capture.

When in Solid mode (no existing RAF), a new RAF loop starts when `trailEnabled = true` and stops when both `trailEnabled = false` and `paused = true` (same cleanup pattern as `colorRafId`).

```typescript
// In MandalaPane.svelte, unified tick handler:
function tickAnimations(time: number) {
  if (startTime === null) startTime = time;
  const elapsed = (time - startTime) / 1000;

  // 1. Advance color phase (if flow mode)
  if (colorMode === "flow") {
    colorPhase = (elapsed % cyclePeriod) / cyclePeriod;
  }

  // 2. Capture ghost frame (if trails enabled)
  if (trailEnabled) {
    maybeCaptureGhost();
  }

  animRafId = requestAnimationFrame(tickAnimations);
}
```

### Ghost Capture Logic

```typescript
let lastGhostTipDx = -999;
let lastGhostRotationDeg = -999;
let ghostCaptureId = 0;  // monotonic counter — provides unique {#each} keys

function maybeCaptureGhost() {
  // Under Option B, animatedDx and currentRotationDeg are owned by MandalaPane directly
  const currentTipDx = animatedDx;
  const currentRot = currentRotationDeg;

  const dxDelta = Math.abs(currentTipDx - lastGhostTipDx);
  const rotDelta = Math.abs(currentRot - lastGhostRotationDeg);

  if (dxDelta < MIN_DX_DELTA && rotDelta < MIN_ROT_DELTA) return;

  lastGhostTipDx = currentTipDx;
  lastGhostRotationDeg = currentRot;

  const svgStr = renderMandalaSVG(currentPaths, currentRenderOptions);
  const newGhost: GhostFrame = {
    id: ghostCaptureId++,
    svgString: svgStr,
    rotationDeg: currentRot,
    // No opacity stored — computed at render time from buffer index
  };

  // Prepend and trim — no opacity recomputation needed
  ghostBuffer = [newGhost, ...ghostBuffer].slice(0, trailLength);
}
```

### Accessing SequenceMandala's Internal State

`SequenceMandala` manages `animatedDx` and `rotationDeg` internally. Two approaches:

**Option A (preferred): Bind-back via callback props.** Add `onAnimatedDxChange` and `onRotationDegChange` callback props to `SequenceMandala`. The component calls these inside its RAF tick. `MandalaPane` stores the latest values in local state for ghost capture.

**Option B: Replicate the animation state in MandalaPane.** `MandalaPane` already implements `breatheEase()` for the export pipeline. The same RAF logic that drives `SequenceMandala`'s undulation can be run in parallel in `MandalaPane`, keeping them in sync by sharing the same start time. This eliminates the need to modify `SequenceMandala`.

Option B is cleaner because it avoids adding render-observer callbacks to a presentational component. `MandalaPane` already has full knowledge of all animation parameters (`period`, `rangeMax`, `rotation`). The `breatheEase` function is identical in both files. The RAF runs once in `MandalaPane`; `SequenceMandala` receives the resulting `tipDx` via its existing `tipDx` override prop (bypassing its own animation when `tipDx` is set externally).

After this change, `SequenceMandala` in `MandalaPane` runs with `animate={false}` and receives `tipDx={animatedDx}`. All animation state is owned by `MandalaPane`, making ghost capture straightforward.

### Constants

```typescript
const TRAIL_BASE_OPACITY = 0.45;
const TRAIL_DECAY_RATE = 0.62;
const MIN_DX_DELTA = 8;       // units of tipDx
const MIN_ROT_DELTA = 3;      // degrees
const DARK_BG_LUMINANCE_THRESHOLD = 0.2;  // relative luminance below which screen blend activates
```

All defined as module-level constants in `MandalaPane.svelte`. Not exposed as user controls — they are calibration values, not creative parameters.

`bgLuminance` is a derived value computed from `bgColor` whenever it changes:

```typescript
// Relative luminance per WCAG 2.1 (linearized sRGB)
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const bgLuminance = $derived(relativeLuminance(bgColor));
```

When `bgLuminance < 0.2`, the `.ghost-layer` receives the `dark-bg` class and ghost frames switch to `mix-blend-mode: screen`. On light backgrounds, the class is absent and ghosts composite via normal opacity blending.

---

## Performance Considerations

### SVG String Count

With `trailLength = 8` and SVGs around 4KB each (typical for a 4-beat LOOP), the ghost buffer holds ~32KB of string data. This is negligible memory. The ghost SVGs are rendered via `{@html}` into DOM nodes; each is a real SVG element. At trailLength = 15, that is 15 `<svg>` elements in the DOM simultaneously.

Browser SVG rendering at the mandala's scale (~600px) is cheap per element. The concern is not individual SVG cost but cumulative GPU fill rate for overlapping, partially-transparent SVGs. Each ghost SVG includes a `filter="url(#glow)"` feGaussianBlur. 15 simultaneous blur filters are the primary performance risk.

**Mitigation:** Strip the `glow` filter from ghost SVGs. Ghost frames exist for their shape and color — the live frame provides the glow. Use the `suppressGlow: true` render option (see Files Changed section). This omits both the `filter="url(#glow)"` reference and the `<filter id="glow">` definition from the `<defs>` block, eliminating both the blur cost and the filter ID collision (since all ghost SVGs + the live SVG share the same flat DOM scope).

Additionally, the overlap mask logic (`needsMask`, the feather/bloom filter pair for purple overlap) can be disabled for ghost frames. Ghost overlap zones render without the purple blend region — the shape is what matters. Pass `show: "blue"` and `show: "red"` as two separate ghosts? No — this doubles the SVG count. Instead, set `overlap: { feather: 0, bloomOpacity: 0, bloomBlur: 0, bloomWidth: 1, coreOpacity: 0.5 }` for ghost renders to produce a lightweight overlap without the gaussian blur.

### Sampling Rate as Performance Lever

If the device is struggling (detected via the DeviceTierDetector, already present in the codebase), reduce the effective ghost sampling by increasing `MIN_DX_DELTA` and `MIN_ROT_DELTA`. On low-tier devices, a trail length cap of 5 ghosts with doubled thresholds maintains the visual effect while halving the SVG creation rate.

### Paused State

When `paused = true`, the mandala is frozen. No new ghosts are captured. The existing ghost buffer remains visible (the afterimage hangs in the air). On resume, ghost capture resumes normally. This behavior requires no special handling — the RAF loop stops when paused, so `maybeCaptureGhost` never fires.

### Cleanup on Settings Change

When `trailEnabled` toggles to false, `ghostBuffer = []` to immediately clear the ghost stack. When `trailLength` decreases, trim the buffer: `ghostBuffer = ghostBuffer.slice(0, trailLength)`. No opacity recomputation is needed — opacity is derived from buffer index at render time.

---

## Export Integration

The existing MP4 export pipeline in `MandalaPane.handleDownload()` renders frames via `renderMandalaSVG` in a for loop, encodes via `VideoEncoder` (WebCodecs API) + `mp4-muxer` for MP4 container wrapping. Trails must be rendered into each export frame.

> **Note on h264-mp4-encoder:** Do not use `h264-mp4-encoder` (also published as `mp4-h264`). That project is **suspended** — the author removed H.264 encoding code due to MPEG LA royalty concerns for distributed software. The codebase's `VideoExporter` already wraps the correct WebCodecs stack (`VideoEncoder` + `mp4-muxer`, MIT-licensed). All export work goes through that service.
>
> WebCodecs browser support: Chrome/Edge (since Chrome 94, 2021), Firefox (since Firefox 130, 2024), Safari (full support in Safari 26+; earlier Safari 16.4–18.7 had partial support). Add a `VideoEncoder.isConfigSupported({ codec: 'avc1.42E01E' })` guard at export start; surface a clear error if it returns false rather than silently failing. Do not fall back to the suspended WASM encoder.

### Export Ghost Buffer

During export, the ghost buffer is maintained as a local array (not the reactive `ghostBuffer` state). For each exported frame `i`:

1. Compute `tipDx` and `rotDeg` for this frame (existing logic, unchanged).
2. Compute palette and gradient for this frame (existing logic, unchanged).
3. Render the live SVG: `renderMandalaSVG(paths, { ...opts, suppressGlow: false })`.
4. If trails enabled: render ghost SVGs from the export ghost buffer (same structs, `suppressGlow: true`).
5. Composite ghosts + live frame onto the export canvas via `compositeGhostToCanvas()` (see Export Compositing below).

### Export Compositing

`svgToCanvas()` cannot be used directly for ghost compositing. It calls `ctx.clearRect(0, 0, s, s)` followed by `ctx.fillRect` on every invocation — even with a transparent background argument, the `clearRect` destroys all previously drawn layers. Calling it for each ghost in sequence would leave only the last layer on the canvas.

The correct approach uses a separate `compositeGhostToCanvas()` helper that converts each SVG to an `Image` without touching the destination canvas, then composites all images in a single pass:

```typescript
async function compositeGhostToCanvas(
  svgStr: string,
  canvas: HTMLCanvasElement,
  rotDeg: number,
  opacity: number,
): Promise<void> {
  // Convert SVG → blob → Image (same mechanics as svgToCanvas, but no clearRect)
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.src = url;
  });
  URL.revokeObjectURL(url);

  const ctx = canvas.getContext("2d")!;
  const s = canvas.width;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(s / 2, s / 2);
  ctx.rotate((rotDeg * Math.PI) / 180);
  ctx.translate(-s / 2, -s / 2);
  ctx.drawImage(img, 0, 0, s, s);
  ctx.restore();
}
```

The export sequence per frame:

1. Clear canvas with `bgColor` fill (one call to `svgToCanvas` with the live SVG and `bgColor` handles this for the base layer).
2. Actually: clear + fill background color manually, then composite layers in order:
   - `ctx.fillStyle = bgColor; ctx.fillRect(0, 0, s, s)`
   - For each ghost (oldest first, lowest opacity first): `await compositeGhostToCanvas(ghost.svgStr, canvas, ghost.rotDeg, BASE_OPACITY * DECAY_RATE^i)`
   - For the live frame: `await compositeGhostToCanvas(liveSvgStr, canvas, rotDeg, 1.0)`
3. Pass the canvas frame to `VideoExporter` (WebCodecs `VideoEncoder` + `mp4-muxer`).

With 8 ghosts, this is 9 sequential SVG-to-image conversions per frame. At ~5ms each, that is 45ms additional work per export frame — acceptable for offline export.

### Export Ghost Buffer Population

During export, the ghost buffer starts empty. Populate it using the same motion-threshold sampling logic, but applied to the sequence of `tipDx` values as they are computed sequentially across the export frame loop. This ensures the exported video has the same visual rhythm as the live viewer.

Alternatively: use time-uniform sampling at one ghost per `GHOST_EXPORT_INTERVAL_FRAMES = 6` frames (at 30fps, that is 5 ghost captures per second, matching the ~5fps live ghost rate). This is simpler to implement and sufficient for export fidelity.

---

## Edge Cases

### Trail Enabled While Paused

The ghost buffer is empty (no captures happened while paused). On unpause, ghosts begin accumulating normally. The transition from no-trail to trail is instant — not a problem.

### Color Mode Switch While Trails Active

Switching from Flow to Solid (or vice versa) does not clear the ghost buffer. Existing ghosts retain their original colors. This produces a momentary mixed-palette smear as old Flow ghosts fade out while new Solid ghosts accumulate. The effect is a natural transition, not an artifact. No special handling needed.

### Path Shape Change While Trails Active

Same as color mode: old ghosts retain their original shape. The transition produces a shape morph visible in the trail. Intentional — the trail is a time record of the state at capture time.

### Sequence Change

Clear `ghostBuffer = []` on sequence change. The new sequence's mandala starts with no trail. Detection: `$effect(() => { if (sequence) ghostBuffer = []; })` watching the sequence prop.

### Trails + Rotation = 0

With zero rotation, the mandala doesn't move angularly, and if depth is low, tipDx barely changes. The motion threshold may never fire. Fallback: add a maximum time gap — if more than 500ms has elapsed since the last ghost capture and `trailEnabled`, force a capture regardless of motion thresholds. This ensures the trail buffer doesn't expire visually.

### Browser Without SVG Filter Support

All target browsers (Chrome/Safari/Firefox/Edge, all evergreen) support SVG filter elements. No fallback needed.

### `prefers-reduced-motion`

The existing `SequenceMandala` doesn't gate animation on `prefers-reduced-motion`. Trails should follow the same policy: no explicit gating. The controls give users manual play/pause and trail toggle. An OS-level reduced-motion preference does not disable an interactive creative tool.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/shared/sequence-viewer/components/MandalaPane.svelte` | Add ghost buffer state, unified RAF tick, ghost capture logic, ghost layer template, trail animation driving (`animate={false}`, `tipDx` binding), export trail compositing |
| `src/lib/shared/sequence-viewer/components/MandalaViewerControls.svelte` | Add `trailEnabled` + `trailLength` props, Trails toggle chip, Length slider |
| `src/lib/shared/mandala/services/mandala-renderer.ts` | Add optional `suppressGlow?: boolean` to `MandalaRenderOptions` (see below) |
| `src/lib/shared/mandala/domain/mandala-types.ts` | Add `suppressGlow?: boolean` to `MandalaRenderOptions` interface |

### MandalaRenderOptions Addition

```typescript
export interface MandalaRenderOptions {
  // ... existing fields
  /**
   * When true, omits the per-group glow filter reference from the rendered SVG.
   * Used for ghost/trail frames where blur is expensive and visually redundant.
   */
  suppressGlow?: boolean;
}
```

In `renderMandalaSVG`, two changes are required:

**1. Suppress the glow filter reference** on the group wrapper:

```typescript
const glowFilter = options.suppressGlow ? '' : ' filter="url(#glow)"';
parts.push(`  <g transform="translate(${center}, ${center}) scale(${scale.toFixed(4)})"${glowFilter}>`);
```

**2. Suppress the glow filter definition** in `<defs>`:

```typescript
// Only emit the glow filter definition when it will actually be referenced
if (!options.suppressGlow) {
  parts.push(`  <defs>`);
  parts.push(`    <filter id="glow">...</filter>`);
  parts.push(`  </defs>`);
}
```

Both changes are necessary. If the `<filter id="glow">` definition is emitted but unreferenced in a ghost SVG, and there are 8 ghost SVGs + 1 live SVG in the same document, all 9 define `id="glow"` in the flat DOM. **This is a confirmed rendering-breaking bug, not undefined behavior.** Per Mozilla Bugzilla #835709 (open): the first definition of a given ID in DOM insertion order wins. Because ghost frames are inserted into the DOM *before* the live frame, their `<filter id="glow">` definition takes precedence. The live frame's `id="glow"` definition is silently ignored — and when a ghost is later removed from the DOM, all remaining SVGs referencing `id="glow"` lose their filter entirely (they do not fall back; they simply render without the filter). The net effect: ghost `<defs>` blocks shadow the live frame's glow, and the glow breaks mid-session as ghosts cycle out of the buffer. The mask/overlap filter IDs already use `maskIdCounter` for uniqueness; the glow filter must follow the same pattern or be omitted entirely when `suppressGlow` is true. Omission is simpler.

---

## Non-Goals

- Canvas-based trail compositing. SVG stacking is simpler, leverages the existing `renderMandalaSVG` pipeline, and performs acceptably at the trail lengths in scope.
- Per-trail color overrides. The trail inherits the colors of the moment of capture. No additional color remapping.
- Saving trail settings to user preferences. Settings are session-local (same as all other mandala controls today).
- Trail effects on the card back mandala. The static card back renders a single frame; trails are an interactive viewer feature only.
- Trail effects on the live mandala drawing overlay (`MandalaOverlayCanvas`). That system has its own fade mechanism.
