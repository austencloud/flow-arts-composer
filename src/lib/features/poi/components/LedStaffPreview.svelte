<!--
  LedStaffPreview.svelte - 2D virtual LED staff preview.

  Renders the active StripPattern as a pair of horizontal LED staves,
  playing on their own internal clock. This matches how real LED props
  actually behave: the pattern loops continuously at its own rate,
  independent of what your body is doing with the prop. A pattern
  "runs" on the staff the same way it would on your physical hardware.

  Both staves share one pattern for now (matching the default TKA
  convention where both hands do the same thing). Per-staff patterns
  come later, via the sequence timeline.
-->
<script lang="ts">
  import { getPoiContext } from "../context/poi-context";
  import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
  import ScrubValue from "#lib/shared/ui/components/ScrubbableNumber.svelte";

  const poi = getPoiContext();

  let canvasRef = $state<HTMLCanvasElement | null>(null);
  let playing = $state(true);

  const cycleDuration = $derived(poi.cycleDuration);

  /**
   * Sample a specific frame from a pattern at a normalized cycle
   * position in [0, 1). Keeps both blended patterns sampled at the
   * same phase so time-varying effects (rainbows, pulses) stay
   * aligned during a crossfade.
   */
  function frameAt(pattern: StripPattern, cyclePos: number) {
    const idx = Math.floor(cyclePos * pattern.frameCount) % pattern.frameCount;
    return pattern.frames[idx]!;
  }

  // Animation loop - runs for the lifetime of the canvas element.
  // Reads blendInfo / cycleDuration / playing at call time so updates
  // flow through without restarting the loop.
  $effect(() => {
    const canvas = canvasRef;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let prevTime = performance.now();
    // Normalized cycle position in [0, 1). Advances independent of which
    // pattern is active so blended clips share a single clock and rainbows
    // don't suddenly jump during a crossfade.
    let cyclePos = 0;
    let rafId = 0;
    let paused = false;

    function draw() {
      if (!canvas || !ctx) return;
      if (document.hidden) {
        paused = true;
        return;
      }

      // Rich playback state - primary is the incoming pattern, secondary
      // (when non-null) is the outgoing pattern being crossfaded out.
      const info = poi.blendInfo;
      const primary = info.primary;
      const secondary = info.secondary;

      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;

      if (playing && primary) {
        const safeDuration = Math.max(0.1, cycleDuration);
        // One full cycle per `cycleDuration` seconds, regardless of how
        // many frames the active pattern has.
        cyclePos += dt / safeDuration;
        cyclePos = cyclePos - Math.floor(cyclePos);
        if (cyclePos < 0) cyclePos += 1;
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

      // Black background - matches the darkened room where you'd spin
      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      if (!primary) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      // Build the Uint8Array of LED colors we'll actually draw. If we're
      // crossfading, lerp per-LED between the outgoing and incoming frame.
      // Otherwise just reuse the primary's own frame buffer.
      const ledCount = primary.ledCount;
      let drawColors: Uint8Array;
      if (secondary) {
        const frameA = frameAt(secondary, cyclePos); // outgoing
        const frameB = frameAt(primary, cyclePos);   // incoming
        const t = info.blendT;
        const oneMinusT = 1 - t;
        // Safe ledCount - if the two clips somehow disagree, use the
        // smaller of the two so we don't read past either buffer.
        const safeLedCount = Math.min(
          ledCount,
          secondary.ledCount,
          primary.ledCount,
        );
        const blended = new Uint8Array(safeLedCount * 3);
        for (let led = 0; led < safeLedCount; led++) {
          const off = led * 3;
          blended[off]     = Math.round(frameA.colors[off]!     * oneMinusT + frameB.colors[off]!     * t);
          blended[off + 1] = Math.round(frameA.colors[off + 1]! * oneMinusT + frameB.colors[off + 1]! * t);
          blended[off + 2] = Math.round(frameA.colors[off + 2]! * oneMinusT + frameB.colors[off + 2]! * t);
        }
        drawColors = blended;
      } else {
        drawColors = frameAt(primary, cyclePos).colors;
      }

      // Two staves stacked vertically, sharing the same (possibly blended) frame.
      const staffHeight = h * 0.22;
      const staffGap = h * 0.12;
      const totalStaffArea = staffHeight * 2 + staffGap;
      const startY = (h - totalStaffArea) / 2;

      drawStaff(ctx, w, startY, staffHeight, ledCount, drawColors);
      drawStaff(ctx, w, startY + staffHeight + staffGap, staffHeight, ledCount, drawColors);

      rafId = requestAnimationFrame(draw);
    }

    function onVisibilityChange() {
      if (!document.hidden && paused) {
        paused = false;
        prevTime = performance.now();
        rafId = requestAnimationFrame(draw);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  /**
   * Draw a single horizontal LED staff with glowing LEDs.
   *
   * Layout: [grip] [LED strip] [grip] - the grips are dark end caps
   * where your hands go; the strip in the middle is where the LEDs live.
   */
  function drawStaff(
    ctx: CanvasRenderingContext2D,
    w: number,
    y: number,
    staffH: number,
    ledCount: number,
    colors: Uint8Array,
  ): void {

    // Staff geometry
    const staffMargin = w * 0.04;
    const staffLength = w - staffMargin * 2;
    const gripLength = staffLength * 0.07;
    const stripStart = staffMargin + gripLength;
    const stripEnd = staffMargin + staffLength - gripLength;
    const stripW = stripEnd - stripStart;
    const ledWidth = stripW / ledCount;
    const stripCy = y + staffH / 2;
    const bodyHeight = staffH * 0.55;
    const bodyTop = stripCy - bodyHeight / 2;

    // Dark staff body (matte)
    ctx.fillStyle = "#0a0a0d";
    ctx.fillRect(staffMargin, bodyTop, staffLength, bodyHeight);

    // Subtle body outline
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(staffMargin + 0.5, bodyTop + 0.5, staffLength - 1, bodyHeight - 1);

    // Grips - slightly darker than body, where your hands go
    ctx.fillStyle = "#050509";
    ctx.fillRect(staffMargin, bodyTop, gripLength, bodyHeight);
    ctx.fillRect(stripEnd, bodyTop, gripLength, bodyHeight);

    // Grip texture - thin horizontal lines suggesting a wrap
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    const gripLines = 4;
    for (let i = 1; i < gripLines; i++) {
      const gy = bodyTop + (bodyHeight / gripLines) * i;
      ctx.beginPath();
      ctx.moveTo(staffMargin, gy);
      ctx.lineTo(staffMargin + gripLength, gy);
      ctx.moveTo(stripEnd, gy);
      ctx.lineTo(stripEnd + gripLength, gy);
      ctx.stroke();
    }

    // Bloom layer - faint blurred halo behind the LED strip
    ctx.save();
    ctx.filter = `blur(${Math.round(staffH * 0.12)}px)`;
    ctx.globalAlpha = 0.5;
    for (let led = 0; led < ledCount; led++) {
      const offset = led * 3;
      const r = colors[offset]!;
      const g = colors[offset + 1]!;
      const b = colors[offset + 2]!;
      if (r + g + b < 12) continue;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(
        stripStart + led * ledWidth - ledWidth * 0.5,
        stripCy - staffH * 0.5,
        ledWidth * 2,
        staffH
      );
    }
    ctx.restore();

    // Core LED strip - the bright, crisp line of LEDs
    const ledHeight = bodyHeight * 0.58;
    const ledTop = stripCy - ledHeight / 2;
    for (let led = 0; led < ledCount; led++) {
      const offset = led * 3;
      const r = colors[offset]!;
      const g = colors[offset + 1]!;
      const b = colors[offset + 2]!;

      // Brighten the core slightly so it feels emissive
      const coreR = Math.min(255, r + 40);
      const coreG = Math.min(255, g + 40);
      const coreB = Math.min(255, b + 40);
      ctx.fillStyle = `rgb(${coreR},${coreG},${coreB})`;
      ctx.fillRect(
        stripStart + led * ledWidth,
        ledTop,
        ledWidth + 0.5,
        ledHeight
      );
    }

    // Thin highlight along top of strip - specular sheen
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(stripStart, ledTop, stripW, Math.max(1, ledHeight * 0.08));
  }
</script>

<div class="staff-preview">
  <div class="canvas-frame">
    <canvas bind:this={canvasRef} class="staff-canvas"></canvas>
  </div>

  <div class="controls-bar">
    <button
      class="icon-btn"
      onclick={() => { playing = !playing; }}
      aria-label={playing ? "Pause" : "Play"}
    >
      <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
    </button>

    <ScrubValue
      label="Cycle"
      value={cycleDuration}
      min={0.2}
      max={20}
      step={0.1}
      unit="s"
      format={(v) => v.toFixed(1)}
      onchange={(v) => poi.setCycleDuration(v)}
    />
  </div>
</div>

<style>
  .staff-preview {
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
    padding-bottom: 42%;
    box-shadow:
      0 0 20px rgba(80, 140, 255, 0.06),
      inset 0 0 30px rgba(0, 0, 0, 0.4);
  }

  .staff-canvas {
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
</style>
