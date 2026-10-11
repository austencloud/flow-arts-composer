<!--
  /test/petals-rethink

  Side-by-side comparison harness for petal MOTION MODELS. Two synthetic
  staves spin/swing through a controllable path; their four tips feed the
  real petal silhouette kernel. Four cells: the shipped renderer (baseline)
  plus three rethink models. Pick favorites by eye, then we converge on a
  spec.

  Disposable test route — nothing in the app imports this.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { createVariants, type PetalVariant, type TipMap } from "./variants";
  import {
    PETAL_PALETTES,
    type PetalPalette,
  } from "#lib/shared/effects/domain/petal-palettes.js";

  const RES = 520; // internal canvas resolution (CSS scales the element)

  type Pattern = "spin" | "figure8" | "pendulum";
  const PATTERNS: Pattern[] = ["spin", "figure8", "pendulum"];
  const PALETTE_IDS = ["blossom", "autumn", "gold", "jungle", "ash"] as const;
  type PaletteId = (typeof PALETTE_IDS)[number];

  let playing = $state(true);
  let pattern = $state<Pattern>("spin");
  let speed = $state(1.0);
  let baseSize = $state(8);
  let density = $state(1.0);
  let paletteId = $state<PaletteId>("blossom");
  let carry = $state(0.55);
  let streak = $state(0.4);

  type FlowerMode = "show" | "thin" | "hide";
  const FLOWER_MODES: FlowerMode[] = ["show", "thin", "hide"];
  let flowerMode = $state<FlowerMode>("thin");

  let palette = $derived<PetalPalette>(buildPalette(paletteId, flowerMode));

  function buildPalette(id: PaletteId, fm: FlowerMode): PetalPalette {
    const base = PETAL_PALETTES[id];
    if (id !== "blossom") return base;
    let sprites: PetalPalette["sprites"];
    if (fm === "hide")
      sprites = [
        "blossom_petal",
        "blossom_petal_folded",
        "blossom_petal_curled",
      ];
    else if (fm === "thin") sprites = base.sprites;
    else
      sprites = [
        "blossom_flower",
        "blossom_petal",
        "blossom_petal_folded",
        "blossom_petal_curled",
      ];
    return { ...base, sprites };
  }

  const variants: PetalVariant[] = createVariants();
  let canvases: (HTMLCanvasElement | null)[] = $state(
    Array(variants.length).fill(null)
  );
  let counts = $state<number[]>(Array(variants.length).fill(0));
  let fps = $state(0);

  let clock = 0;
  let lastT = 0;
  let raf = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;

  function tipsAt(t: number, W: number, H: number): TipMap {
    const cx = W / 2;
    const cy = H / 2;
    const handR = Math.min(W, H) * 0.12;
    const staffR = Math.min(W, H) * 0.2;
    let bh: { x: number; y: number };
    let rh: { x: number; y: number };
    let bang: number;
    let rang: number;

    if (pattern === "spin") {
      bh = {
        x: W * 0.34 + Math.cos(t * 1.1) * handR,
        y: cy + Math.sin(t * 1.1) * handR,
      };
      rh = {
        x: W * 0.66 + Math.cos(-t * 1.1 + Math.PI) * handR,
        y: cy + Math.sin(-t * 1.1) * handR,
      };
      bang = t * 3.0;
      rang = -t * 3.0 + Math.PI / 2;
    } else if (pattern === "figure8") {
      bh = {
        x: cx + Math.sin(t * 1.2) * W * 0.22,
        y: cy + Math.sin(t * 2.4) * H * 0.16,
      };
      rh = {
        x: cx + Math.sin(t * 1.2 + Math.PI) * W * 0.22,
        y: cy + Math.sin(t * 2.4) * H * 0.16,
      };
      bang = t * 2.2;
      rang = -t * 2.2;
    } else {
      const swing = Math.sin(t * 1.3);
      bh = { x: W * 0.34, y: cy };
      rh = { x: W * 0.66, y: cy };
      bang = Math.PI * 0.5 + swing * 0.95;
      rang = Math.PI * 0.5 - swing * 0.95;
    }

    return {
      blueA: {
        x: bh.x + Math.cos(bang) * staffR,
        y: bh.y + Math.sin(bang) * staffR,
      },
      blueB: {
        x: bh.x - Math.cos(bang) * staffR,
        y: bh.y - Math.sin(bang) * staffR,
      },
      redA: {
        x: rh.x + Math.cos(rang) * staffR,
        y: rh.y + Math.sin(rang) * staffR,
      },
      redB: {
        x: rh.x - Math.cos(rang) * staffR,
        y: rh.y - Math.sin(rang) * staffR,
      },
    };
  }

  function drawStaff(
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
    color: string
  ) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (lastT === 0) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05; // clamp tab-switch spikes

    if (playing) clock += dt * speed;

    // fps meter
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      fps = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
    }

    const tips = tipsAt(clock, RES, RES);
    const opts = {
      baseSize,
      density,
      palette,
      width: RES,
      height: RES,
      carry,
      streak,
    };

    for (let i = 0; i < variants.length; i++) {
      const canvas = canvases[i];
      if (!canvas) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.clearRect(0, 0, RES, RES);
      drawStaff(ctx, tips.blueA!, tips.blueB!, "#5b8cff");
      drawStaff(ctx, tips.redA!, tips.redB!, "#ff5b6e");
      variants[i]!.render(ctx, tips, playing ? dt : 0, opts);
      const c = variants[i]!.count();
      if (c >= 0) counts[i] = c;
    }
  }

  function reset() {
    for (const v of variants) v.dispose();
    clock = 0;
  }

  onMount(() => {
    raf = requestAnimationFrame(frame);
  });
  onDestroy(() => {
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
    for (const v of variants) v.dispose();
  });
</script>

<div class="page">
  <header>
    <h1>Petals — motion model comparison</h1>
    <p class="sub">
      Same synthetic prop motion feeds all four. Watch how each model moves,
      then tell me which one(s) to keep. Drag <b>Size</b> down to see the "too
      big" complaint disappear; crank <b>Speed</b> to test reactivity.
    </p>
  </header>

  <div class="controls">
    <div class="group">
      <span class="label">Play</span>
      <button
        class="seg"
        aria-pressed={playing}
        onclick={() => (playing = !playing)}
      >
        {playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      <button class="seg" onclick={reset}>↺ Reset</button>
    </div>

    <div class="group">
      <span class="label">Pattern</span>
      {#each PATTERNS as p}
        <button
          class="seg"
          aria-pressed={pattern === p}
          onclick={() => (pattern = p)}>{p}</button
        >
      {/each}
    </div>

    <div class="group">
      <span class="label">Palette</span>
      {#each PALETTE_IDS as id}
        <button
          class="seg"
          aria-pressed={paletteId === id}
          onclick={() => (paletteId = id)}>{id}</button
        >
      {/each}
    </div>

    <div class="group slider">
      <span class="label">Speed <b>{speed.toFixed(1)}×</b></span>
      <input type="range" min="0.1" max="3" step="0.1" bind:value={speed} />
    </div>

    <div class="group slider">
      <span class="label">Size <b>{baseSize}px</b></span>
      <input type="range" min="3" max="18" step="1" bind:value={baseSize} />
    </div>

    <div class="group slider">
      <span class="label">Density <b>{density.toFixed(1)}×</b></span>
      <input type="range" min="0.2" max="3" step="0.1" bind:value={density} />
    </div>

    <div class="group slider accent">
      <span class="label"
        >Carry <b>{Math.round(carry * 100)}%</b> <em>A</em></span
      >
      <input type="range" min="0" max="1" step="0.05" bind:value={carry} />
    </div>

    <div class="group slider accent">
      <span class="label"
        >Streak <b>{Math.round(streak * 100)}%</b> <em>A</em></span
      >
      <input type="range" min="0" max="1" step="0.05" bind:value={streak} />
    </div>

    <div class="group">
      <span class="label">Flower</span>
      {#each FLOWER_MODES as fm}
        <button
          class="seg"
          aria-pressed={flowerMode === fm}
          disabled={paletteId !== "blossom"}
          onclick={() => (flowerMode = fm)}>{fm}</button
        >
      {/each}
    </div>

    <div class="group meta">
      <span class="label">fps <b>{fps}</b></span>
    </div>
  </div>

  <div class="grid">
    {#each variants as v, i}
      <figure class="cell">
        <figcaption>
          <span class="title">{v.title}</span>
          {#if (counts[i] ?? 0) > 0}<span class="count">{counts[i]} live</span
            >{/if}
          <span class="blurb">{v.blurb}</span>
        </figcaption>
        <canvas
          bind:this={canvases[i]}
          width={RES}
          height={RES}
          aria-label={v.title}
        ></canvas>
      </figure>
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #0a0a0f;
    color: #e8e8ef;
    padding: 20px;
    font-family: system-ui, sans-serif;
  }
  header h1 {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 700;
  }
  .sub {
    margin: 0 0 16px;
    max-width: 720px;
    color: #a8a8b8;
    font-size: 14px;
    line-height: 1.5;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: center;
    padding: 12px 14px;
    margin-bottom: 18px;
    background: #14141c;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .group.slider {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .label {
    font-size: 12px;
    color: #9a9aac;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .label b {
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .seg {
    min-height: 36px;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: transparent;
    color: #d8d8e2;
    font-size: 13px;
    cursor: pointer;
    text-transform: capitalize;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }
  .seg:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .seg[aria-pressed="true"] {
    background: rgba(123, 140, 255, 0.18);
    border-color: #7b8cff;
    color: #fff;
  }
  input[type="range"] {
    width: 150px;
    accent-color: #7b8cff;
  }
  .accent input[type="range"] {
    accent-color: #ffb0c8;
  }
  .label em {
    font-style: normal;
    font-size: 10px;
    color: #ffb0c8;
    border: 1px solid #ffb0c8;
    border-radius: 4px;
    padding: 0 3px;
    margin-left: 2px;
  }
  .seg:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  @media (max-width: 820px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  .cell {
    margin: 0;
    background: #101018;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
  }
  figcaption {
    display: grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    gap: 6px 10px;
    padding: 10px 12px 8px;
  }
  .title {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }
  .count {
    justify-self: end;
    font-size: 11px;
    color: #8a8a9a;
    font-variant-numeric: tabular-nums;
  }
  .blurb {
    grid-column: 1 / -1;
    font-size: 12px;
    color: #9a9aac;
    line-height: 1.4;
  }
  canvas {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    background: radial-gradient(circle at 50% 40%, #181826, #0c0c12);
  }
</style>
