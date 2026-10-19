<!--
  Goo 2D lab: the production Goo2DRenderer driven by four staffs (two
  spinning, one swinging, one held still) over a dark stage, so the ropes
  and drops can be judged frame by frame without a sequence.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { Goo2DRenderer } from "#lib/shared/effects/renderers/goo-2d-renderer.js";
  import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
  import { resolveGoo2D } from "#lib/shared/effects/translators/canvas2d-translator.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import { GOO_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/goo-presets.js";
  import type { GooIntent } from "#lib/shared/effects/domain/effects-config.js";

  type Speed = 1 | 0.25 | 0;

  let host: HTMLDivElement;
  let presetId = $state(GOO_PRESETS[0]!.id);
  let speed = $state<Speed>(1);
  let stats = $state({ strands: 0, drops: 0 });

  const STEP = 1 / 60;
  /** Pane size the effect scale is measured against. */
  const REFERENCE = 500;
  const COLORS = ["#3a7fd9", "#d93a3a", "#3a7fd9", "#d93a3a"];

  function intent(): GooIntent {
    const preset = GOO_PRESETS.find((item) => item.id === presetId)!;
    return { ...DEFAULT_EFFECTS_CONFIG.goo, ...preset.patch } as GooIntent;
  }

  onMount(() => {
    const canvas = document.createElement("canvas");
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    const goo = new Goo2DRenderer();
    let width = 1;
    let height = 1;
    let dpr = 1;
    let time = 0;
    let tips: EmitterTip[] = [];

    /** Hand position, staff angle and half length for staff `i` at time `t`. */
    function staff(i: number, t: number) {
      const size = Math.min(width, height);
      const half = size * 0.13;
      if (i === 0) {
        return {
          x: width * 0.28,
          y: height * 0.34,
          angle: t * 2 * Math.PI * 0.9,
          half,
        };
      }
      if (i === 1) {
        const wobble = 0.04 * size * Math.sin(t * 2.1);
        return {
          x: width * 0.72 + wobble,
          y: height * 0.34,
          angle: -t * 2 * Math.PI * 1.25,
          half,
        };
      }
      if (i === 2) {
        return {
          x: width * 0.5,
          y: height * 0.22,
          angle: Math.PI / 2 + 1.05 * Math.sin(t * Math.PI),
          half,
        };
      }
      return { x: width * 0.5, y: height * 0.52, angle: 0.12, half };
    }

    function place(t: number): void {
      tips = [];
      for (let i = 0; i < 4; i++) {
        const { x, y, angle, half } = staff(i, t);
        for (const tipIndex of [0, 1]) {
          const side = tipIndex === 0 ? 1 : -1;
          tips.push({
            x: x + Math.cos(angle) * half * side,
            y: y + Math.sin(angle) * half * side,
            propIndex: i,
            tipIndex,
            end: tipIndex === 0 ? "A" : "B",
            color: COLORS[i]!,
          });
        }
      }
    }

    function backdrop(): void {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#0b0e18");
      sky.addColorStop(1, "#141a2a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(220,228,255,0.18)";
      const step = Math.min(width, height) / 10;
      for (let x = step / 2; x < width; x += step) {
        for (let y = step / 2; y < height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const a = tips[i * 2]!;
        const b = tips[i * 2 + 1]!;
        ctx.strokeStyle = COLORS[i]!;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = "#e8ecf4";
        for (const tip of [a, b]) {
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    let pending = 0;
    function step(dt: number): void {
      time += dt;
      place(time);
      pending += dt;
    }

    function render(): void {
      backdrop();
      const scale = Math.min(width, height) / REFERENCE;
      goo.render(ctx, resolveGoo2D(intent()), tips, pending, scale);
      pending = 0;
      stats = counts();
    }

    /** Advance the sim in fixed steps, drawing only the last. */
    function advance(seconds: number): void {
      const scale = Math.min(width, height) / REFERENCE;
      const params = resolveGoo2D(intent());
      for (let t = 0; t + STEP <= seconds + 1e-9; t += STEP) {
        step(STEP);
        backdrop();
        goo.render(ctx, params, tips, pending, scale);
        pending = 0;
      }
      stats = counts();
    }

    function counts() {
      return {
        strands: goo.sim.strands.length,
        drops: goo.sim.drops.length,
      };
    }

    function resize(): void {
      dpr = window.devicePixelRatio || 1;
      width = host.clientWidth;
      height = host.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      place(time);
      render();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let carry = 0;
    let last = performance.now();
    let raf = 0;
    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      carry += Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      while (carry >= STEP) {
        step(STEP);
        carry -= STEP;
      }
      render();
    }
    raf = requestAnimationFrame(frame);

    const lab = {
      advance,
      clear: () => goo.dispose(),
      // A hidden browser pane stalls ResizeObserver and rAF; labs call these.
      resize,
      render,
      counts,
      goo,
    };
    (window as unknown as { __goo2dLab: typeof lab }).__goo2dLab = lab;
    clearLab = lab.clear;

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      goo.dispose();
      canvas.remove();
    };
  });

  let clearLab = () => {};
</script>

<div class="lab">
  <div class="stage" bind:this={host}></div>
  <div class="bar">
    <div class="group" aria-label="Preset">
      {#each GOO_PRESETS as preset (preset.id)}
        <button
          aria-pressed={presetId === preset.id}
          onclick={() => (presetId = preset.id)}
        >
          {preset.name}
        </button>
      {/each}
    </div>
    <div class="group" aria-label="Speed">
      {#each [[1, "1x"], [0.25, "Slow"], [0, "Pause"]] as const as [value, label] (label)}
        <button aria-pressed={speed === value} onclick={() => (speed = value)}
          >{label}</button
        >
      {/each}
    </div>
    <div class="group">
      <button onclick={() => clearLab()}>Clear</button>
    </div>
    <span class="stats">
      {stats.strands} ropes, {stats.drops} drops
    </span>
  </div>
</div>

<style>
  .lab {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    background: #05070d;
    color: #e6e9f2;
    font:
      14px system-ui,
      sans-serif;
  }
  .stage {
    min-height: 0;
    position: relative;
  }
  .stage :global(canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    align-items: center;
    padding: 10px 14px;
    background: #10141e;
  }
  .group {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  button {
    border: 1px solid #3a4256;
    background: #1a2030;
    color: inherit;
    padding: 6px 12px;
    border-radius: 999px;
    cursor: pointer;
  }
  button:hover {
    background: #252c40;
  }
  button[aria-pressed="true"] {
    background: #3a7fd9;
    border-color: #6fb3ff;
  }
  .stats {
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
</style>
