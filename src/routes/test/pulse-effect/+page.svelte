<script lang="ts">
  import { onMount } from "svelte";
  import {
    Pulse2DRenderer,
    type PulseTipInput,
  } from "#lib/shared/effects/renderers/pulse-2d-renderer.js";
  import { resolvePulse2D } from "#lib/shared/effects/translators/canvas2d-translator.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import { PULSE_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/pulse-presets.js";
  import type { PulseIntent } from "#lib/shared/effects/domain/effects-config.js";

  // Live intent — drives the REAL renderer via resolvePulse2D each frame.
  let intent = $state<PulseIntent>({ ...DEFAULT_EFFECTS_CONFIG.pulse });
  let activePreset = $state<string>("default");

  // Demo motion controls.
  let speed = $state(0.4); // rev/s — sane default (was spinning absurdly fast)
  let beatsPerSec = $state(2);
  let paused = $state(false);

  const PRESETS = [
    { id: "default", name: "Default", patch: null as Partial<PulseIntent> | null },
    ...PULSE_PRESETS.filter((p) => p.id !== "pulse-custom").map((p) => ({
      id: p.id,
      name: p.name,
      patch: p.patch as Partial<PulseIntent>,
    })),
  ];

  function applyPreset(p: (typeof PRESETS)[number]) {
    intent = p.patch
      ? { ...DEFAULT_EFFECTS_CONFIG.pulse, ...p.patch }
      : { ...DEFAULT_EFFECTS_CONFIG.pulse };
    activePreset = p.id;
  }

  function set<K extends keyof PulseIntent>(key: K, value: PulseIntent[K]) {
    intent = { ...intent, [key]: value };
    activePreset = "custom";
  }

  const SLIDERS: { key: keyof PulseIntent; label: string; min: number; max: number; step: number; pct?: boolean }[] = [
    { key: "intensity", label: "Intensity", min: 0, max: 1, step: 0.05, pct: true },
    { key: "reach", label: "Reach", min: 0, max: 1, step: 0.05, pct: true },
    { key: "lifetime", label: "Lifetime (beats)", min: 0.2, max: 3, step: 0.1 },
    { key: "thickness", label: "Thickness", min: 0, max: 1, step: 0.05, pct: true },
    { key: "velocityScale", label: "Velocity → Size", min: 0, max: 1, step: 0.05, pct: true },
    { key: "asymmetry", label: "Momentum", min: 0, max: 1, step: 0.05, pct: true },
    { key: "chromatic", label: "Chromatic", min: 0, max: 1, step: 0.05, pct: true },
    { key: "flash", label: "Flash", min: 0, max: 1, step: 0.05, pct: true },
    { key: "harmonics", label: "Harmonics", min: 0, max: 1, step: 0.05, pct: true },
    { key: "beatInterval", label: "Beat interval", min: 1, max: 8, step: 1 },
    { key: "charge", label: "Build-up", min: 0, max: 1, step: 0.05, pct: true },
    { key: "velocityThreshold", label: "Vel. threshold", min: 0, max: 1, step: 0.05, pct: true },
  ];

  const TRIGGERS: PulseIntent["trigger"][] = ["beat", "velocity", "continuous"];
  const STYLES: PulseIntent["style"][] = ["stroke", "glow"];
  const PALETTES: PulseIntent["palette"][] = ["sonar", "ripple", "aurora", "neon", "ember", "void", "custom"];
  const COLOR_MODES: PulseIntent["colorMode"][] = ["solid", "prop-matched", "rainbow", "palette"];

  let canvas = $state<HTMLCanvasElement>();
  let copied = $state("");

  function copyIntent() {
    copied = JSON.stringify(intent, null, 2);
    void navigator.clipboard?.writeText(copied);
  }

  onMount(() => {
    const ctx = canvas!.getContext("2d")!;
    const renderer = new Pulse2DRenderer();
    let raf = 0;
    let prev = performance.now();
    let elapsed = 0;
    let dpr = 1;

    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas!.getBoundingClientRect();
      canvas!.width = Math.round(r.width * dpr);
      canvas!.height = Math.round(r.height * dpr);
    }
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas!);

    // Two staves (blue prop 0, red prop 1), each a line of two ends spinning
    // about a pivot. 4 tips total feed the renderer.
    function tipsAt(t: number, w: number, h: number): PulseTipInput[] {
      const cx = w / 2;
      const cy = h / 2;
      const sep = Math.min(w, h) * 0.22;
      const len = Math.min(w, h) * 0.18;
      const ang = t * speed * Math.PI * 2;
      const pivots = [
        { x: cx - sep, y: cy, idx: 0 as const },
        { x: cx + sep, y: cy, idx: 1 as const },
      ];
      const out: PulseTipInput[] = [];
      let tipIndex = 0;
      for (const p of pivots) {
        const a = p.idx === 0 ? ang : -ang; // counter-spin so it reads as two props
        for (const dir of [1, -1]) {
          out.push({
            x: p.x + Math.cos(a) * len * dir,
            y: p.y + Math.sin(a) * len * dir,
            propIndex: p.idx,
            tipIndex: tipIndex++,
            end: dir === 1 ? 0 : 1,
            color: p.idx === 0 ? "#3a8fff" : "#ff4a6a",
          });
        }
      }
      return out;
    }

    function frame(now: number) {
      let dt = (now - prev) / 1000;
      prev = now;
      if (dt > 0.05) dt = 0.05;
      if (!paused) elapsed += dt;

      const W = canvas!.width;
      const H = canvas!.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#05060c";
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cssW = W / dpr;
      const cssH = H / dpr;
      const tips = tipsAt(elapsed, cssW, cssH);
      const params = resolvePulse2D($state.snapshot(intent));
      const currentStep = elapsed * beatsPerSec;

      renderer.render(ctx, params, tips, currentStep, paused ? 0 : dt, 1);

      // Draw the tip markers so the motion is legible.
      for (const tp of tips) {
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = tp.propIndex === 0 ? "#3a8fff" : "#ff4a6a";
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
    };
  });
</script>

<div class="page">
  <header>
    <h1>Pulse Effect Lab</h1>
    <p>
      The shipped <code>Pulse2DRenderer</code> driven by two simulated spinning staves.
      Pick a preset, tweak any value live, then Copy Intent and paste the JSON back.
    </p>
  </header>

  <div class="body">
    <div class="stage">
      <canvas bind:this={canvas}></canvas>
    </div>

    <aside class="controls">
      <section>
        <div class="label">Presets</div>
        <div class="chips">
          {#each PRESETS as p (p.id)}
            <button class:on={activePreset === p.id} onclick={() => applyPreset(p)}>{p.name}</button>
          {/each}
        </div>
      </section>

      <section>
        <div class="label">Motion</div>
        <label class="slider">
          <span>Spin speed <b>{speed.toFixed(2)} rev/s</b></span>
          <input type="range" min="0" max="1.5" step="0.05" bind:value={speed} />
        </label>
        <label class="slider">
          <span>Beat rate <b>{beatsPerSec.toFixed(1)}/s</b></span>
          <input type="range" min="0.5" max="6" step="0.5" bind:value={beatsPerSec} />
        </label>
        <button class="wide" class:on={paused} onclick={() => (paused = !paused)}>
          {paused ? "Paused" : "Pause"}
        </button>
      </section>

      <section>
        <div class="label">Trigger</div>
        <div class="chips">
          {#each TRIGGERS as t (t)}
            <button class:on={intent.trigger === t} onclick={() => set("trigger", t)}>{t}</button>
          {/each}
        </div>
        <div class="label">Style</div>
        <div class="chips">
          {#each STYLES as s (s)}
            <button class:on={intent.style === s} onclick={() => set("style", s)}>{s}</button>
          {/each}
        </div>
        <div class="label">Palette</div>
        <div class="chips">
          {#each PALETTES as pl (pl)}
            <button class:on={intent.palette === pl} onclick={() => set("palette", pl)}>{pl}</button>
          {/each}
        </div>
        <div class="label">Color mode</div>
        <div class="chips">
          {#each COLOR_MODES as cm (cm)}
            <button class:on={intent.colorMode === cm} onclick={() => set("colorMode", cm)}>{cm}</button>
          {/each}
        </div>
      </section>

      <section>
        <div class="label">Values</div>
        {#each SLIDERS as s (s.key)}
          <label class="slider">
            <span>{s.label} <b>{s.pct ? Math.round((intent[s.key] as number) * 100) + "%" : intent[s.key]}</b></span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={intent[s.key] as number}
              oninput={(e) => set(s.key, +(e.currentTarget as HTMLInputElement).value as PulseIntent[typeof s.key])}
            />
          </label>
        {/each}
      </section>

      <button class="wide copy" onclick={copyIntent}>Copy Intent JSON</button>
      {#if copied}
        <pre class="out">{copied}</pre>
      {/if}
    </aside>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #05060c;
    color: #e8ecf4;
    font: 14px/1.45 ui-sans-serif, system-ui, sans-serif;
  }
  header {
    padding: 18px 24px 8px;
  }
  header h1 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  header p {
    margin: 0;
    font-size: 12.5px;
    color: #8893a8;
    max-width: 720px;
  }
  header code {
    color: #5fd0ff;
  }
  .body {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 18px;
    padding: 12px 24px 40px;
  }
  .stage {
    background: #05060c;
    border: 1px solid #1b2230;
    border-radius: 14px;
    overflow: hidden;
    min-height: 520px;
  }
  .stage canvas {
    display: block;
    width: 100%;
    height: 70vh;
  }
  .controls {
    align-self: start;
    position: sticky;
    top: 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  section {
    background: #0c1018;
    border: 1px solid #1d2433;
    border-radius: 12px;
    padding: 12px;
  }
  .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #6f7b92;
    margin: 6px 0 6px;
  }
  .label:first-child {
    margin-top: 0;
  }
  .chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .chips button,
  .wide {
    flex: 1 1 auto;
    padding: 6px 9px;
    font-size: 11px;
    border-radius: 7px;
    border: 1px solid #2a3346;
    background: #131a26;
    color: #aeb8cc;
    cursor: pointer;
    white-space: nowrap;
  }
  .chips button.on,
  .wide.on {
    background: #1b4a63;
    border-color: #5fd0ff;
    color: #dff4ff;
  }
  .wide {
    width: 100%;
    margin-top: 8px;
  }
  .slider {
    display: block;
    margin-bottom: 8px;
  }
  .slider span {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #aeb8cc;
    margin-bottom: 3px;
  }
  .slider b {
    color: #e8ecf4;
    font-variant-numeric: tabular-nums;
  }
  .slider input {
    width: 100%;
    accent-color: #5fd0ff;
  }
  .copy {
    border-color: #2a5a3a;
    background: #16331f;
    color: #cfeed9;
  }
  .out {
    font-family: ui-monospace, monospace;
    font-size: 10px;
    color: #9aa6bc;
    background: #06080e;
    border: 1px solid #161d2b;
    border-radius: 8px;
    padding: 8px;
    margin: 8px 0 0;
    max-height: 220px;
    overflow: auto;
  }
</style>
