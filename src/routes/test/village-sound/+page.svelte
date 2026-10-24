<!--
  Measures the Room of Collaboration's sound without anyone listening: the
  village ambience (museum/audio/village-ambience.ts) plays through a level
  meter at a chosen distance from the fire, and each cue from
  village-sound-cues.json has a button. Readings print every 250 ms; the last
  ten seconds sit on `window.__villageSound` for a headless check.
  "Render 30 s" plays the room offline instead (village-sound-render.ts): the
  bed at the entry distance with the opening's cues, saved as a WAV. The
  noise seed is fixed, so each render matches the last to within float
  rounding (village-sound-render.ts).
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { VillageAmbience } from "#lib/features/museum/audio/village-ambience.js";
  import {
    METER_WINDOW_SECONDS,
    VillageSoundMeter,
    summarize,
    type VillageSoundReading,
  } from "#lib/features/museum/audio/village-sound-meter.js";
  import {
    VILLAGE_SOUND_CUES,
    type VillageSoundCue,
  } from "#lib/features/museum/data/village-sound-cues.js";
  import {
    OPENING_RENDER_TIMELINE,
    VILLAGE_RENDER_DEFAULTS,
    renderVillageSound,
    largestDifferenceDb,
    villageRenderFileName,
  } from "#lib/features/museum/audio/village-sound-render.js";
  import { encodeWav24 } from "#lib/features/lab/pronunciation-recorder/domain/wav-encoder.js";
  import villageRules from "#lib/features/village/domain/village-rules.json";

  /** The museum's default master volume (soundscape-player.svelte.ts). */
  const MUSEUM_MASTER_VOLUME = 0.7;
  /** The room's fade-in settles within this; its readings stay out of the bed. */
  const SETTLE_SECONDS = 4;
  const AUDIENCE_DISTANCE = villageRules.campfire.audienceDistance;

  let started = $state(false);
  let distance = $state(AUDIENCE_DISTANCE);
  let master = $state(MUSEUM_MASTER_VOLUME);
  let readings = $state<VillageSoundReading[]>([]);

  // Bed and peak at the current distance only, so moving the slider starts fresh.
  const summary = $derived(
    summarize(readings.filter((r) => r.distance === distance))
  );
  const recent = $derived(readings.slice(-12).reverse());

  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let ambience: VillageAmbience | null = null;
  let meter: VillageSoundMeter | null = null;
  let frame = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  function start() {
    if (started) return;
    context = new AudioContext();
    masterGain = context.createGain();
    masterGain.gain.value = master;
    const analyser = context.createAnalyser();
    masterGain.connect(analyser).connect(context.destination);
    meter = new VillageSoundMeter(analyser);
    const output = { context, destination: masterGain };
    ambience = new VillageAmbience(() => output);
    meter.markCue("settling", SETTLE_SECONDS);
    started = true;

    let last = performance.now();
    const tick = (now: number) => {
      ambience?.update(true, distance, (now - last) / 1000);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    interval = setInterval(() => {
      if (!meter) return;
      meter.read(distance);
      readings = [...meter.readings];
    }, METER_WINDOW_SECONDS * 1000);
  }

  function cueLabel(cue: VillageSoundCue): string {
    return `${cue.moment} · ${cue.effect}`;
  }

  function playCue(index: number) {
    const cue = VILLAGE_SOUND_CUES[index];
    if (!cue || !ambience || !meter) return;
    ambience.play(cue);
    meter.markCue(cueLabel(cue), cue.attack + cue.hold + cue.release);
  }

  // Offline render: the bed at the entry distance, with the opening's cues.
  const RENDER = { ...VILLAGE_RENDER_DEFAULTS, distance: AUDIENCE_DISTANCE };
  let rendering = $state(false);
  let lastSamples: Float32Array | null = null;
  let renders = $state<
    { peakDb: number; rmsDb: number; fromLastDb: number | null }[]
  >([]);

  async function render(download = true) {
    if (rendering) return null;
    rendering = true;
    try {
      const samples = await renderVillageSound(RENDER);
      let peak = 0;
      let sumSquares = 0;
      for (const sample of samples) {
        peak = Math.max(peak, Math.abs(sample));
        sumSquares += sample * sample;
      }
      const result = {
        fromLastDb: lastSamples
          ? largestDifferenceDb(lastSamples, samples)
          : null,
        peakDb: toDb(peak),
        rmsDb: toDb(Math.sqrt(sumSquares / samples.length)),
      };
      lastSamples = samples;
      renders = [result, ...renders].slice(0, 4);
      if (download) {
        const url = URL.createObjectURL(
          encodeWav24(samples, RENDER.sampleRate)
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = villageRenderFileName(RENDER);
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return result;
    } finally {
      rendering = false;
    }
  }

  const toDb = (value: number) =>
    value > 0 ? 20 * Math.log10(value) : -Infinity;

  function setDistance(meters: number) {
    distance = meters;
  }

  $effect(() => {
    if (masterGain && context)
      masterGain.gain.setTargetAtTime(master, context.currentTime, 0.05);
  });

  $effect(() => {
    (window as unknown as Record<string, unknown>).__villageSound = {
      started,
      distance,
      master,
      readings,
      summary,
      cues: VILLAGE_SOUND_CUES.map(cueLabel),
      start,
      playCue,
      setDistance,
      renders,
      render,
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(frame);
    if (interval) clearInterval(interval);
    ambience?.dispose();
    void context?.close();
  });

  const db = (value: number) =>
    value <= -120 ? "silent" : `${value.toFixed(1)} dB`;
</script>

<main class="page">
  <h1>Village sound meter</h1>
  <p class="note">
    The Room of Collaboration's ambience, measured after the master volume.
    Levels are dBFS; a peak at or above 0 dB clips.
  </p>

  <section class="render">
    <h2>A file to listen to</h2>
    <p class="note">
      {RENDER.seconds} seconds at {RENDER.distance} m, master {RENDER.master},
      with the opening's cues at {OPENING_RENDER_TIMELINE.map(
        (cue) => `${cue.at} s`
      ).join(", ")} (started, recognition, passing). Noise seed
      {RENDER.noiseSeed.toString(16)}: each render matches the last to within
      float rounding, far below hearing.
    </p>
    <button onclick={() => render()} disabled={rendering}
      >{rendering ? "Rendering…" : `Render ${RENDER.seconds} s`}</button
    >
    {#if renders.length > 0}
      <ul class="renders">
        {#each renders as result, index (index)}
          <li>
            Peak {db(result.peakDb)} · RMS {db(
              result.rmsDb
            )}{result.fromLastDb === null
              ? ""
              : result.fromLastDb === -Infinity
                ? " · identical to the render before"
                : ` · differs from the render before by at most ${result.fromLastDb.toFixed(0)} dB`}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if !started}
    <button class="start" onclick={start}>Start sound</button>
  {:else}
    <section class="controls">
      <label>
        <span>Distance from the fire: <b>{distance.toFixed(1)} m</b></span>
        <input
          type="range"
          min="0.5"
          max="40"
          step="0.5"
          bind:value={distance}
        />
      </label>
      <label>
        <span>Master volume: <b>{master.toFixed(2)}</b></span>
        <input type="range" min="0" max="1" step="0.05" bind:value={master} />
      </label>
      <div class="presets">
        <button onclick={() => setDistance(1)}>1 m</button>
        <button onclick={() => setDistance(4)}>4 m</button>
        <button onclick={() => setDistance(AUDIENCE_DISTANCE)}
          >{AUDIENCE_DISTANCE} m (entry)</button
        >
        <button onclick={() => setDistance(25)}>25 m</button>
      </div>
    </section>

    <section class="cues">
      <h2>Cues</h2>
      {#each VILLAGE_SOUND_CUES as cue, index (index)}
        <button onclick={() => playCue(index)}
          >{cueLabel(cue)} <small>{cue.level}</small></button
        >
      {/each}
    </section>

    <section class="summary">
      <div><span>Bed RMS here</span><b>{db(summary.bedRmsDb)}</b></div>
      <div><span>Loudest peak here</span><b>{db(summary.peakDb)}</b></div>
    </section>

    <table>
      <thead>
        <tr><th>time</th><th>m</th><th>RMS</th><th>peak</th><th>cue</th></tr>
      </thead>
      <tbody>
        {#each recent as reading (reading.time)}
          <tr class:clip={reading.peak >= 1}>
            <td>{reading.time.toFixed(2)}</td>
            <td>{reading.distance.toFixed(1)}</td>
            <td>{db(reading.rmsDb)}</td>
            <td>{db(reading.peakDb)}</td>
            <td>{reading.cue ?? ""}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</main>

<style>
  .page {
    min-height: 100dvh;
    padding: 24px;
    background: #0d0d12;
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
    display: grid;
    gap: 16px;
    align-content: start;
    max-width: 960px;
  }
  h1,
  h2 {
    margin: 0;
  }
  h2 {
    font-size: 1rem;
    width: 100%;
  }
  .note {
    margin: 0;
    color: #a8a8b8;
  }
  button {
    font: inherit;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid #3a3a48;
    background: #1c1c26;
    color: inherit;
    cursor: pointer;
    min-height: 44px;
  }
  .start,
  .render button {
    justify-self: start;
  }
  .render {
    display: grid;
    gap: 8px;
  }
  .renders {
    margin: 0;
    padding-left: 20px;
    font-variant-numeric: tabular-nums;
  }
  .controls,
  .presets,
  .cues,
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
  }
  .controls label {
    display: grid;
    gap: 4px;
    min-width: 260px;
  }
  .summary div {
    display: grid;
    gap: 2px;
    font-variant-numeric: tabular-nums;
  }
  .summary span {
    color: #a8a8b8;
  }
  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 4px 12px 4px 0;
    min-width: 72px;
  }
  .clip {
    color: #ff8a7a;
  }
</style>
