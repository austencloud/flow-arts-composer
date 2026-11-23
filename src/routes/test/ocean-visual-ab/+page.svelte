<!--
  Ocean Visual A/B — Classic vs Classic+, same simulation, same frame.

  ONE orchestrator drives both panels. Each frame the sim steps once, then draws
  twice with the tuning flipped between draws. So the two panels are not two
  runs that happen to look similar — they are the identical fish, in identical
  positions, rendered two ways. Any difference you see is presentation.

  Wipe overlays both on one canvas with a draggable handle — the same pixels at
  the same scale, which is the honest way to judge a colour/depth change.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    OceanBackgroundOrchestrator,
    oceanVisualTuning,
    setOceanVisualTuning,
    BASELINE_TUNING,
    GRADED_TUNING,
    type OceanVisualTuning,
  } from "@austencloud/backgrounds";

  type CharacterTuning = OceanVisualTuning & { characterDetail?: number };

  /**
   * Wipe is the primary comparison: one canvas, graded underneath, baseline
   * clipped over the left of a draggable handle. Baseline/Graded are full-frame
   * toggles for judging each on its own.
   *
   * A side-by-side mode was tried and removed. The sim can't be re-laid-out on a
   * mode switch, so each pane had to scale one world down to half width, and that
   * scaling path smeared both panes. Wipe compares the same pixels at the same
   * scale, which is the more honest comparison anyway.
   */
  type Mode = "split" | "baseline" | "graded";

  let mode: Mode = $state("split");
  let wipe = $state(0.5);
  let fps = $state(0);
  let paused = $state(false);
  let tuning: CharacterTuning = $state({ ...GRADED_TUNING });

  let splitEl: HTMLCanvasElement | undefined = $state();
  let wrapEl: HTMLDivElement | undefined = $state();

  const KNOBS: {
    key: keyof CharacterTuning;
    label: string;
    min: number;
    max: number;
    step: number;
  }[] = [
    { key: "fishScale", label: "Fish scale", min: 0.5, max: 3, step: 0.05 },
    {
      key: "depthFadeStrength",
      label: "Depth fade",
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: "depthTintStrength",
      label: "Depth tint",
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: "depthBlurMaxPx",
      label: "Depth blur px",
      min: 0,
      max: 10,
      step: 0.25,
    },
    { key: "depthBandCount", label: "Depth bands", min: 1, max: 8, step: 1 },
    { key: "causticIntensity", label: "Caustics", min: 0, max: 12, step: 0.25 },
    { key: "fogIntensity", label: "Fog", min: 0, max: 8, step: 0.1 },
    { key: "glowIntensity", label: "Biolum glow", min: 0, max: 10, step: 0.1 },
    {
      key: "characterDetail",
      label: "Character detail",
      min: 0,
      max: 1,
      step: 0.05,
    },
  ];

  onMount(() => {
    let raf = 0;
    let disposed = false;
    let dims = { width: 0, height: 0 };
    const sys = (OceanBackgroundOrchestrator as any).create();

    /**
     * Draw the shared state under one tuning preset.
     * Synchronous, so flipping the module-level tuning between calls is safe.
     */
    function drawWith(
      ctx: CanvasRenderingContext2D,
      preset: OceanVisualTuning | Partial<OceanVisualTuning>
    ) {
      setOceanVisualTuning(preset);
      sys.draw(ctx, dims);
    }

    function sizeCanvas(
      c: HTMLCanvasElement | undefined,
      w: number,
      h: number
    ) {
      if (!c) return;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }

    /** Canvas px == CSS px, matching BackgroundHost (no devicePixelRatio scale). */
    function resize() {
      if (!wrapEl) return;
      const r = wrapEl.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      sizeCanvas(splitEl, w, h);
      dims = { width: w, height: h };
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!wrapEl) return;
      const rect = wrapEl.getBoundingClientRect();
      sys.setPointer(e.clientX - rect.left, e.clientY - rect.top, true);
    };
    const onPointerLeave = () => sys.setPointer(0, 0, false);

    const boot = async () => {
      resize();
      await sys.initialize(dims, "high", { spawnFishOnScreen: true });

      window.addEventListener("resize", resize);
      wrapEl?.addEventListener("pointermove", onPointerMove);
      wrapEl?.addEventListener("pointerleave", onPointerLeave);

      (window as any).__oceanAB = {
        sys,
        get tuning() {
          return tuning;
        },
        set: (p: Partial<OceanVisualTuning>) => Object.assign(tuning, p),
        GRADED_TUNING,
        BASELINE_TUNING,
      };

      let frames = 0;
      let fpsMark = performance.now();

      const loop = (t: number) => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        if (!paused) sys.update(dims, 1);

        const sc = splitEl?.getContext("2d");
        if (sc) {
          if (mode === "baseline") drawWith(sc, BASELINE_TUNING);
          else if (mode === "graded") drawWith(sc, tuning);
          else {
            // Wipe: graded fills the canvas, baseline is clipped to the
            // left of the handle and painted over it.
            drawWith(sc, tuning);
            sc.save();
            sc.beginPath();
            sc.rect(0, 0, sc.canvas.width * wipe, sc.canvas.height);
            sc.clip();
            drawWith(sc, BASELINE_TUNING);
            sc.restore();
          }
        }

        frames++;
        if (t - fpsMark >= 1000) {
          fps = Math.round((frames * 1000) / (t - fpsMark));
          frames = 0;
          fpsMark = t;
        }
      };
      raf = requestAnimationFrame(loop);
    };
    boot();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      wrapEl?.removeEventListener("pointermove", onPointerMove);
      wrapEl?.removeEventListener("pointerleave", onPointerLeave);
      // Restore the shipping look — the harness leaves the module-level tuning
      // wherever its last draw put it, and that global is shared app-wide.
      setOceanVisualTuning(GRADED_TUNING);
      sys.dispose?.();
    };
  });

  function onWipeDrag(e: PointerEvent) {
    if (e.buttons !== 1 || !wrapEl) return;
    const r = wrapEl.getBoundingClientRect();
    wipe = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  }
</script>

<svelte:head><title>Ocean Visual A/B</title></svelte:head>

<div class="page">
  <header class="bar">
    <div class="modes">
      {#each ["split", "baseline", "graded"] as m}
        <button class:active={mode === m} onclick={() => (mode = m as Mode)}>
          {m === "split" ? "Wipe" : m === "baseline" ? "Classic" : "Classic+"}
        </button>
      {/each}
      <button class:active={paused} onclick={() => (paused = !paused)}>
        {paused ? "Paused" : "Pause"}
      </button>
    </div>
    <div class="readout">{fps} fps</div>
  </header>

  <div class="wrap" bind:this={wrapEl}>
    <canvas bind:this={splitEl}></canvas>
    {#if mode === "split"}
      <div
        class="handle"
        style="left: {wipe * 100}%"
        onpointerdown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onpointermove={onWipeDrag}
        role="slider"
        aria-label="Comparison wipe position"
        aria-valuenow={Math.round(wipe * 100)}
        aria-valuemin="0"
        aria-valuemax="100"
        tabindex="0"
      ></div>
      <span class="tag left-tag">Classic</span>
      <span class="tag right-tag graded">Classic+</span>
    {/if}
  </div>

  <aside class="knobs">
    {#each KNOBS as k}
      <label>
        <span class="k">{k.label}</span>
        <input
          type="range"
          min={k.min}
          max={k.max}
          step={k.step}
          value={tuning[k.key] as number}
          oninput={(e) =>
            (tuning = {
              ...tuning,
              [k.key]: Number((e.target as HTMLInputElement).value),
            })}
        />
        <span class="v">{tuning[k.key]}</span>
      </label>
    {/each}
    <div class="presets">
      <button onclick={() => (tuning = { ...GRADED_TUNING })}
        >Reset Classic+</button
      >
      <button
        onclick={() =>
          navigator.clipboard?.writeText(JSON.stringify(tuning, null, 2))}
      >
        Copy values
      </button>
    </div>
  </aside>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #04101c;
    overflow: hidden;
  }
  .page {
    /* Fixed + raised so the root layout's boot overlay doesn't cover the
		   comparison. Same reason /test/ocean-probe pins its canvas. */
    /* behind the status bar: the page's backdrop, its top bar clears the bar */
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr auto;
    height: 100vh;
    background: #04101c;
    font:
      13px/1.4 ui-monospace,
      monospace;
    color: #cfe9ff;
  }
  .bar {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    padding-top: calc(0.5rem + var(--safe-top));
    background: #061826;
    border-bottom: 1px solid #123249;
  }
  .modes {
    display: flex;
    gap: 0.4rem;
  }
  button {
    font: inherit;
    color: #cfe9ff;
    background: #0d2537;
    border: 1px solid #1d4660;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    min-height: 44px;
    cursor: pointer;
  }
  button:hover {
    background: #12324a;
  }
  button.active {
    background: #1c5f8a;
    border-color: #2d8ac2;
  }
  .wrap {
    position: relative;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .tag {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.2rem 0.5rem;
    background: rgba(4, 16, 28, 0.75);
    border-radius: 4px;
    font-size: 12px;
  }
  .tag.graded {
    color: #7fd4ff;
  }
  .left-tag {
    left: 0.5rem;
  }
  .right-tag {
    left: auto;
    right: 0.5rem;
  }
  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 44px;
    margin-left: -22px;
    cursor: ew-resize;
    touch-action: none;
  }
  .handle::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 21px;
    width: 2px;
    background: #7fd4ff;
    box-shadow: 0 0 12px rgba(127, 212, 255, 0.8);
  }
  .knobs {
    width: 20rem;
    padding: 0.75rem;
    background: #061826;
    border-left: 1px solid #123249;
    overflow-y: auto;
  }
  label {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.15rem 0.5rem;
    margin-bottom: 0.7rem;
  }
  .k {
    font-size: 12px;
    opacity: 0.85;
  }
  .v {
    font-size: 12px;
    color: #7fd4ff;
    text-align: right;
  }
  input[type="range"] {
    grid-column: 1 / -1;
    width: 100%;
  }
  .presets {
    display: flex;
    gap: 0.4rem;
    margin-top: 1rem;
  }

  @media (max-width: 900px) {
    .page {
      grid-template-columns: 1fr;
    }

    .knobs {
      display: none;
    }

    .bar {
      grid-column: 1;
    }
  }

  @media (max-width: 480px) {
    .bar {
      gap: 0.5rem;
      padding: 0.4rem 0.5rem;
    }

    .modes {
      gap: 0.3rem;
    }

    .modes button {
      padding-inline: 0.55rem;
    }
  }
</style>
