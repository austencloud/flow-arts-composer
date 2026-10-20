<script lang="ts">
  // Harness for ShiftingMandala: a few showcase sequences on a 120 BPM clock
  // you can play, scrub and reshape. window.__shiftingMandala exposes the
  // clock so a browser check can read beats and pause at a given one.
  import ShiftingMandala from "#lib/shared/mandala/components/ShiftingMandala.svelte";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import {
    DEFAULT_MANDALA_LOOK,
    DEFAULT_MANDALA_SHIFT,
    MANDALA_BREATH_BEATS,
    MANDALA_LINE_WEIGHTS,
    MANDALA_SHIFT_EVERY,
    MANDALA_SHIFT_MORPH,
    MANDALA_SHIFT_PACES,
    MANDALA_SPINS,
    MandalaLookPresetSchema,
    type MandalaLook,
    type MandalaShift,
  } from "#lib/shared/mandala/domain/mandala-shift-types.js";
  import type { ShiftingMandalaSource } from "#lib/shared/mandala/services/mandala-shift-render.js";
  import { SHOWCASE_MANDALAS } from "../../(public)/composer/_sections/showcase-mandalas";

  const BPM = 120;
  const PICKS = [0, 5, 11, 18];
  const SHAPES = ["arc", "linear", "concave", "hybrid"] as const;

  let picked = $state<number[]>(PICKS);
  const sources = $derived<ShiftingMandalaSource[]>(
    picked.map((i) => {
      const m = SHOWCASE_MANDALAS[i]!;
      return { steps: m.steps, leftPropType: m.leftPropType, rightPropType: m.rightPropType };
    })
  );
  let shift = $state<MandalaShift>({ ...DEFAULT_MANDALA_SHIFT });
  let look = $state<MandalaLook>({ ...DEFAULT_MANDALA_LOOK });
  let beats = $state(0);
  let playing = $state(false);
  let reducedMotion = $state(false);

  let frameHandle = 0;
  let lastStamp = 0;
  function tick(now: number) {
    const delta = (now - lastStamp) / 1000;
    lastStamp = now;
    beats = (beats + (delta * BPM) / 60) % (16 * 4);
    frameHandle = requestAnimationFrame(tick);
  }
  function togglePlay() {
    playing = !playing;
    if (playing) {
      lastStamp = performance.now();
      frameHandle = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frameHandle);
    }
  }
  $effect(() => () => cancelAnimationFrame(frameHandle));

  function togglePick(i: number) {
    picked = picked.includes(i) ? picked.filter((p) => p !== i) : [...picked, i].slice(-8);
  }

  $effect(() => {
    (window as unknown as { __shiftingMandala: unknown }).__shiftingMandala = {
      get beats() {
        return beats;
      },
      set beats(value: number) {
        beats = value;
      },
      get playing() {
        return playing;
      },
      play: () => !playing && togglePlay(),
      pause: () => playing && togglePlay(),
    };
  });

  const bar = $derived(Math.floor(beats / 4) + 1);
  const beatInBar = $derived(Math.floor(beats % 4) + 1);
</script>

<svelte:head><title>Shifting mandala</title></svelte:head>

<div class="page" style:background={look.preset === "ink" ? "#f4ecdc" : "#000"}>
  <div class="stage">
    <ShiftingMandala {sources} {shift} {look} {beats} beatsPerBar={4} {reducedMotion} />
  </div>

  <aside class="panel">
    <h1>Shifting mandala</h1>
    <p class="clock">
      {BPM} BPM, bar {bar} beat {beatInBar} ({beats.toFixed(2)} beats)
    </p>
    <div class="row">
      <button type="button" class="big" onclick={togglePlay}>{playing ? "Pause" : "Play"}</button>
      <button type="button" onclick={() => (beats = 0)}>Rewind</button>
      <button type="button" aria-pressed={reducedMotion} onclick={() => (reducedMotion = !reducedMotion)}>
        Reduced motion
      </button>
    </div>
    <label class="slider">
      Beat
      <input type="range" min="0" max="64" step="0.05" bind:value={beats} />
    </label>

    <h2>Sequences ({sources.length})</h2>
    <div class="chips">
      {#each SHOWCASE_MANDALAS as m, i (m.id)}
        <button
          type="button"
          class="chip"
          aria-pressed={picked.includes(i)}
          aria-label={simplifyRepeatedWord(m.name)}
          onclick={() => togglePick(i)}
        >
          <TkaLabel text={simplifyRepeatedWord(m.name)} darkMode />
        </button>
      {/each}
    </div>

    <h2>Shift every</h2>
    <div class="chips">
      {#each MANDALA_SHIFT_EVERY as every (every)}
        {#each ["bars", "beats"] as const as unit (unit)}
          <button
            type="button"
            class="chip"
            aria-pressed={shift.every === every && shift.unit === unit}
            onclick={() => (shift = { ...shift, every, unit })}
          >
            {every} {every === 1 ? unit.slice(0, -1) : unit}
          </button>
        {/each}
      {/each}
    </div>
    <h2>Pace</h2>
    <div class="chips">
      {#each MANDALA_SHIFT_PACES as pace (pace)}
        <button type="button" class="chip" aria-pressed={(shift.pace ?? "steady") === pace} onclick={() => (shift = { ...shift, pace })}>{pace}</button>
      {/each}
    </div>
    <h2>Morph over (landing)</h2>
    <div class="chips">
      {#each MANDALA_SHIFT_MORPH as morph (morph)}
        <button type="button" class="chip" aria-pressed={shift.morph === morph} onclick={() => (shift = { ...shift, morph })}>
          {morph} {morph === 1 ? "beat" : "beats"}
        </button>
      {/each}
    </div>

    <h2>Shape</h2>
    <div class="chips">
      {#each SHAPES as shape (shape)}
        <button type="button" class="chip" aria-pressed={look.shape === shape} onclick={() => (look = { ...look, shape })}>{shape}</button>
      {/each}
    </div>
    <h2>Colours</h2>
    <div class="chips">
      <button type="button" class="chip" aria-pressed={look.colorMode === "flow"} onclick={() => (look = { ...look, colorMode: "flow" })}>flow</button>
      <button type="button" class="chip" aria-pressed={look.colorMode === "solid"} onclick={() => (look = { ...look, colorMode: "solid" })}>solid</button>
    </div>
    <div class="chips">
      {#each MandalaLookPresetSchema.options as preset (preset)}
        <button type="button" class="chip" aria-pressed={look.preset === preset} onclick={() => (look = { ...look, preset })}>{preset}</button>
      {/each}
    </div>
    <h2>Weight</h2>
    <div class="chips">
      {#each MANDALA_LINE_WEIGHTS as lineWeight (lineWeight)}
        <button type="button" class="chip" aria-pressed={look.lineWeight === lineWeight} onclick={() => (look = { ...look, lineWeight })}>{lineWeight}</button>
      {/each}
    </div>
    <label class="slider">
      Depth {look.depth}
      <input type="range" min="0" max="100" step="5" bind:value={look.depth} />
    </label>
    <h2>Breath</h2>
    <div class="chips">
      {#each MANDALA_BREATH_BEATS as breathBeats (breathBeats)}
        <button type="button" class="chip" aria-pressed={look.breathBeats === breathBeats} onclick={() => (look = { ...look, breathBeats })}>{breathBeats === 0 ? "off" : `${breathBeats} ${breathBeats === 1 ? "beat" : "beats"}`}</button>
      {/each}
    </div>
    <h2>Spin per bar</h2>
    <div class="chips">
      {#each MANDALA_SPINS as spinPerBar (spinPerBar)}
        <button type="button" class="chip" aria-pressed={look.spinPerBar === spinPerBar} onclick={() => (look = { ...look, spinPerBar })}>{spinPerBar}°</button>
      {/each}
    </div>
  </aside>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 22rem;
    height: 100vh;
    color: #e7e9f5;
    font-family: "Inter", system-ui, sans-serif;
  }
  .stage {
    min-width: 0;
    min-height: 0;
  }
  .panel {
    overflow: auto;
    padding: 1rem 1.2rem 2rem;
    background: #0e1024;
    border-left: 1px solid #22254a;
  }
  h1 {
    font-size: 1.2rem;
    margin: 0 0 0.3rem;
  }
  h2 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9aa0c4;
    margin: 1rem 0 0.4rem;
  }
  .clock {
    margin: 0 0 0.6rem;
    color: #9aa0c4;
    font-variant-numeric: tabular-nums;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  button {
    font: inherit;
    font-size: 0.85rem;
    color: #e7e9f5;
    background: #1a1d3d;
    border: 1px solid #2d3160;
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }
  button.big {
    padding: 0.4rem 1.2rem;
    font-weight: 650;
  }
  button[aria-pressed="true"] {
    background: #4f46e5;
    border-color: #6366f1;
  }
  .slider {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-top: 0.8rem;
    font-size: 0.85rem;
    color: #9aa0c4;
  }
  .slider input {
    width: 100%;
  }
</style>
