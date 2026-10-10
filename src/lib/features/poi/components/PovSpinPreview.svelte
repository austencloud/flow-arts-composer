<!--
  PovSpinPreview.svelte - Spinning POV simulation of a StripPattern.

  Simulates real persistence-of-vision physics: a single staff line sweeps
  around the circle, and the trail of light fades behind it. Your eye
  integrates the fading trail into the full image - just like watching
  a pixel poi performer in a dark room.

  The disc image (all frames mapped to angles) is pre-rendered once.
  Each animation frame, only the persistence window is drawn - a wedge
  from the staff's current angle backwards, with alpha fading from
  bright (leading edge) to black (trailing edge).
-->
<script lang="ts">
  import { getPoiContext } from "../context/poi-context";
  import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
  import ScrubValue from "#lib/shared/ui/components/ScrubbableNumber.svelte";

  const poi = getPoiContext();

  let canvasRef = $state<HTMLCanvasElement | null>(null);
  let playing = $state(true);
  let animFrameId = $state(0);

  // rpm and showFullDisc are persisted in poi state
  const rpm = $derived(poi.rpm);
  const showFullDisc = $derived(poi.showFullDisc);

  const DISC_SIZE = 512;

  // Pre-render the full disc image for one pattern. Each frame of the
  // pattern becomes an angular wedge; each LED becomes a concentric ring
  // within that wedge. The result is the spinnable disc the POV trail
  // sweeps over.
  function renderDiscToCanvas(pattern: StripPattern): OffscreenCanvas {
    const size = DISC_SIZE;
    const oc = new OffscreenCanvas(size, size);
    const ctx = oc.getContext("2d")!;

    const cx = size / 2;
    const cy = size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = outerRadius * 0.15; // Hub matches real poi hardware

    const { ledCount, frameCount, frames } = pattern;
    const angleStep = (Math.PI * 2) / frameCount;
    const radiusStep = (outerRadius - innerRadius) / ledCount;

    for (let f = 0; f < frameCount; f++) {
      const frame = frames[f]!;
      const startAngle = f * angleStep - Math.PI / 2;
      const endAngle = startAngle + angleStep + 0.002;

      for (let led = 0; led < ledCount; led++) {
        const offset = led * 3;
        const r = frame.colors[offset]!;
        const g = frame.colors[offset + 1]!;
        const b = frame.colors[offset + 2]!;

        if (r === 0 && g === 0 && b === 0) continue;

        const rInner = innerRadius + led * radiusStep;
        const rOuter = rInner + radiusStep + 0.5;

        ctx.beginPath();
        ctx.arc(cx, cy, rOuter, startAngle, endAngle);
        ctx.arc(cx, cy, rInner, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
      }
    }

    return oc;
  }

  // Two pre-rendered disc canvases + one reusable compositing canvas.
  // During a crossfade the draw loop alpha-composites secondary and
  // primary into the blend canvas (which is mathematically per-pixel
  // RGB lerp), then uses that as the source for the trail rendering.
  let primaryDiscCanvas: OffscreenCanvas | null = null;
  let secondaryDiscCanvas: OffscreenCanvas | null = null;
  let blendDiscCanvas: OffscreenCanvas | null = null;

  // ── Performance-critical indirection ────────────────────────────────
  // `poi.blendInfo` is a $derived that re-evaluates every animation frame
  // during timeline playback (because it depends on playheadBeat). The
  // returned object is NEW each frame, but its `.primary` and `.secondary`
  // fields are stable StripPattern references that only change at clip
  // boundaries. These intermediate $deriveds extract those fields so
  // Svelte's reference-equality memoization kicks in: the downstream
  // effects that rebuild the disc canvases then only fire at real clip
  // changes instead of every rAF tick. Without this indirection each
  // frame would trigger two 512×512 canvas rebuilds and the spin would
  // visibly stutter.
  const primaryPattern = $derived(poi.blendInfo.primary);
  const secondaryPattern = $derived(poi.blendInfo.secondary);

  // Rebuild primary disc only when the incoming pattern reference changes.
  $effect(() => {
    primaryDiscCanvas = primaryPattern
      ? renderDiscToCanvas(primaryPattern)
      : null;
  });

  // Rebuild secondary disc only when the outgoing pattern reference changes.
  // During non-blend moments secondary is null, so this stays cheap.
  $effect(() => {
    secondaryDiscCanvas = secondaryPattern
      ? renderDiscToCanvas(secondaryPattern)
      : null;
  });

  /** Number of wedge segments to draw in the persistence trail */
  const TRAIL_SEGMENTS = 64;

  // Animation loop
  $effect(() => {
    const canvas = canvasRef;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let prevTime = performance.now();
    let staffAngle = 0;
    let paused = false;

    function draw() {
      if (!canvas || !ctx) return;
      if (document.hidden) {
        paused = true;
        return;
      }

      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;

      if (playing) {
        staffAngle += (rpm * Math.PI * 2) / 60 * dt;
      }

      // Sync canvas pixels to display size
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayW = Math.round(rect.width * dpr);
      const displayH = Math.round(rect.height * dpr);
      if (canvas.width !== displayW || canvas.height !== displayH) {
        canvas.width = displayW;
        canvas.height = displayH;
      }

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const drawRadius = Math.min(w, h) * 0.46;

      // Black background
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);

      // Resolve which pre-rendered disc the trail should sweep over.
      // During a crossfade we alpha-composite secondary (outgoing) and
      // primary (incoming) into a reusable blend canvas - source-over
      // with alpha is mathematically per-pixel RGB lerp, so the blend
      // walks smoothly between the two patterns. Outside transitions
      // it's just the primary disc.
      const info = poi.blendInfo;
      let discToUse: OffscreenCanvas | null = primaryDiscCanvas;
      if (
        info.secondary &&
        secondaryDiscCanvas &&
        primaryDiscCanvas &&
        info.blendT < 1
      ) {
        if (!blendDiscCanvas) {
          blendDiscCanvas = new OffscreenCanvas(DISC_SIZE, DISC_SIZE);
        }
        const bctx = blendDiscCanvas.getContext("2d")!;
        bctx.clearRect(0, 0, DISC_SIZE, DISC_SIZE);
        bctx.globalAlpha = 1 - info.blendT;
        bctx.drawImage(secondaryDiscCanvas, 0, 0);
        bctx.globalAlpha = info.blendT;
        bctx.drawImage(primaryDiscCanvas, 0, 0);
        bctx.globalAlpha = 1;
        discToUse = blendDiscCanvas;
      }

      if (!discToUse) {
        animFrameId = requestAnimationFrame(draw);
        return;
      }

      if (showFullDisc) {
        // Static mode: subtle ambient glow behind the disc
        const ambientGlow = ctx.createRadialGradient(cx, cy, drawRadius * 0.8, cx, cy, drawRadius * 1.15);
        ambientGlow.addColorStop(0, "rgba(100, 180, 255, 0.06)");
        ambientGlow.addColorStop(1, "transparent");
        ctx.fillStyle = ambientGlow;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.drawImage(discToUse, -drawRadius, -drawRadius, drawRadius * 2, drawRadius * 2);
        ctx.restore();
      } else {
        // POV mode: persistence window sweeps around the fixed disc.
        const rps = rpm / 60;
        const persistence = poi.persistenceDuration;
        const persistenceFraction = Math.min(rps * persistence, 1.0);
        const persistenceArc = persistenceFraction * Math.PI * 2;
        const segmentArc = persistenceArc / TRAIL_SEGMENTS;

        // Bloom layer: faint, slightly larger copy of the trail for glow
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.filter = `blur(${Math.round(drawRadius * 0.02)}px)`;
        for (let i = TRAIL_SEGMENTS - 1; i >= 0; i--) {
          const t = i / TRAIL_SEGMENTS;
          const alpha = (1.0 - t) * (1.0 - t);
          if (alpha < 0.05) continue;

          const segEnd = staffAngle - i * segmentArc;
          const segStart = segEnd - segmentArc;

          ctx.save();
          ctx.globalAlpha = alpha * 0.3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, drawRadius * 1.04, segStart, segEnd);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(discToUse, cx - drawRadius, cy - drawRadius, drawRadius * 2, drawRadius * 2);
          ctx.restore();
        }
        ctx.restore();

        // Main trail segments with fade
        for (let i = TRAIL_SEGMENTS - 1; i >= 0; i--) {
          const t = i / TRAIL_SEGMENTS;
          const alpha = (1.0 - t) * (1.0 - t);
          if (alpha < 0.01) continue;

          const segEnd = staffAngle - i * segmentArc;
          const segStart = segEnd - segmentArc;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, drawRadius + 2, segStart, segEnd);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(discToUse, cx - drawRadius, cy - drawRadius, drawRadius * 2, drawRadius * 2);
          ctx.restore();
        }

        // Pixel poi staff: glowing LED strip along the radius. During a
        // crossfade we blend the outgoing and incoming clips' LED colors
        // per-LED at the same cycle phase, so the leading edge visually
        // matches the disc composite behind it.
        const primaryPattern = info.primary;
        const secondaryPattern = info.secondary;
        if (primaryPattern) {
          const innerR = drawRadius * 0.15;
          const stripLength = drawRadius - innerR;
          const { ledCount, frameCount, frames } = primaryPattern;

          const normalizedAngle = ((staffAngle + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const frameIdx = Math.floor((normalizedAngle / (Math.PI * 2)) * frameCount) % frameCount;
          const frame = frames[frameIdx]!;

          // Outgoing-clip frame sampled at the same angular phase -
          // guards against ledCount / frameCount mismatch between the
          // two clips so we never read past either buffer.
          let secondaryFrame: { colors: Uint8Array } | null = null;
          let safeLedCount = ledCount;
          const blendT = info.blendT;
          const oneMinusT = 1 - blendT;
          if (secondaryPattern && blendT < 1) {
            const s = secondaryPattern;
            const sFrameIdx = Math.floor((normalizedAngle / (Math.PI * 2)) * s.frameCount) % s.frameCount;
            secondaryFrame = s.frames[sFrameIdx]!;
            safeLedCount = Math.min(ledCount, s.ledCount);
          }

          const segLength = stripLength / safeLedCount;
          const staffWidth = Math.max(4 * dpr, drawRadius * 0.025);
          const cosA = Math.cos(staffAngle);
          const sinA = Math.sin(staffAngle);
          const perpX = -sinA;
          const perpY = cosA;
          const halfW = staffWidth / 2;

          for (let led = 0; led < safeLedCount; led++) {
            const offset = led * 3;
            let r = frame.colors[offset]!;
            let g = frame.colors[offset + 1]!;
            let b = frame.colors[offset + 2]!;
            if (secondaryFrame) {
              const sr = secondaryFrame.colors[offset]!;
              const sg = secondaryFrame.colors[offset + 1]!;
              const sb = secondaryFrame.colors[offset + 2]!;
              r = Math.round(sr * oneMinusT + r * blendT);
              g = Math.round(sg * oneMinusT + g * blendT);
              b = Math.round(sb * oneMinusT + b * blendT);
            }

            const rStart = innerR + led * segLength;
            const rEnd = rStart + segLength;

            // Outer glow halo
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            const glowW = halfW * 3;
            ctx.beginPath();
            ctx.moveTo(cx + cosA * rStart - perpX * glowW, cy + sinA * rStart - perpY * glowW);
            ctx.lineTo(cx + cosA * rEnd - perpX * glowW, cy + sinA * rEnd - perpY * glowW);
            ctx.lineTo(cx + cosA * rEnd + perpX * glowW, cy + sinA * rEnd + perpY * glowW);
            ctx.lineTo(cx + cosA * rStart + perpX * glowW, cy + sinA * rStart + perpY * glowW);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Bright core
            const coreR = Math.min(255, r + 50);
            const coreG = Math.min(255, g + 50);
            const coreB = Math.min(255, b + 50);
            ctx.fillStyle = `rgb(${coreR},${coreG},${coreB})`;
            ctx.beginPath();
            ctx.moveTo(cx + cosA * rStart - perpX * halfW, cy + sinA * rStart - perpY * halfW);
            ctx.lineTo(cx + cosA * rEnd - perpX * halfW, cy + sinA * rEnd - perpY * halfW);
            ctx.lineTo(cx + cosA * rEnd + perpX * halfW, cy + sinA * rEnd + perpY * halfW);
            ctx.lineTo(cx + cosA * rStart + perpX * halfW, cy + sinA * rStart + perpY * halfW);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Outer rim glow - faint ring at the disc edge
        const rimGlow = ctx.createRadialGradient(cx, cy, drawRadius * 0.92, cx, cy, drawRadius * 1.08);
        rimGlow.addColorStop(0, "transparent");
        rimGlow.addColorStop(0.5, "rgba(120, 180, 255, 0.04)");
        rimGlow.addColorStop(1, "transparent");
        ctx.fillStyle = rimGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, drawRadius * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center hub - dark disc matching real poi hardware
      const hubRadius = drawRadius * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, hubRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#0a0a0a";
      ctx.fill();
      // Subtle rim on the hub
      ctx.beginPath();
      ctx.arc(cx, cy, hubRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();

      animFrameId = requestAnimationFrame(draw);
    }

    function onVisibilityChange() {
      if (!document.hidden && paused) {
        paused = false;
        prevTime = performance.now();
        animFrameId = requestAnimationFrame(draw);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    animFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

</script>

<div class="spin-preview">
  <div class="canvas-frame">
    <canvas
      bind:this={canvasRef}
      class="spin-canvas"
    ></canvas>
  </div>

  <div class="controls-bar">
    <button
      class="icon-btn"
      onclick={() => { playing = !playing; }}
      aria-label={playing ? "Pause" : "Play"}
    >
      <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
    </button>

    <button
      class="icon-btn"
      class:active={showFullDisc}
      onclick={() => { poi.setShowFullDisc(!showFullDisc); }}
      aria-label={showFullDisc ? "POV mode" : "Full disc"}
      title={showFullDisc ? "Switch to POV simulation" : "Show full pattern disc"}
    >
      <i class="fas {showFullDisc ? 'fa-eye' : 'fa-compact-disc'}" aria-hidden="true"></i>
    </button>

    <ScrubValue
      label="Spin"
      value={rpm}
      min={10}
      max={600}
      step={5}
      unit=" rpm"
      onchange={(v) => { poi.setRpm(Math.round(v)); }}
    />

    <ScrubValue
      label="Trail"
      value={poi.persistenceDuration * 1000}
      min={30}
      max={1000}
      step={5}
      unit="ms"
      format={(v) => String(Math.round(v))}
      onchange={(v) => poi.setPersistenceDuration(v / 1000)}
    />
  </div>
</div>

<style>
  .spin-preview {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .canvas-frame {
    position: relative;
    background: #050508;
    border-radius: 12px;
    border: 1px solid rgba(100, 160, 255, 0.12);
    overflow: hidden;
    width: 100%;
    padding-bottom: 100%;
    box-shadow: 0 0 20px rgba(80, 140, 255, 0.06), inset 0 0 30px rgba(0, 0, 0, 0.4);
  }

  .spin-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .controls-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.15));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    color: var(--theme-text-primary, #e2e8f0);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: border-color 0.15s;
    flex-shrink: 0;
  }

  .icon-btn:hover {
    border-color: var(--theme-accent, #3b82f6);
  }

  .icon-btn.active {
    border-color: var(--theme-accent, #3b82f6);
    background: color-mix(in srgb, var(--theme-accent, #3b82f6) 20%, transparent);
  }

</style>
