<!--
  Side-by-side comparison of the opening tunnel hook's speed curves. Every
  tile plays the same hook, the sequence's own tunnel running through once,
  with a different curve from hook progress to sequence progress. The clock is
  tunnelHookArrival and the performers' fade is tunnelHookCopyOpacity, the same
  functions the editor and export use, so what a tile does is what the post
  will do. The canvas's slide into the lower half is a separate box keyframe
  and is left out here so only the speed differs between tiles.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import PostStudioSequenceAnimationLayer from "#lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { hydrateSequence } from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import { loopDetector } from "#lib/features/create/generate/circular/services/loop-detector.js";
  import { registerLoopDetector } from "#lib/shared/create/get-loop-detector.js";
  import {
    DEFAULT_TUNNEL_HOOK,
    tunnelHookArrival,
  } from "#lib/shared/media-composition/domain/tunnel-hook.js";
  import {
    sampleEasing,
    type PostEasingPresetId,
    EASING_PRESETS,
  } from "#lib/shared/media-composition/domain/post-project-keyframes.js";

  interface Variant {
    id: string;
    name: string;
    note: string;
    /** `null` is the hook's original curve. */
    curve: [number, number, number, number] | null;
  }

  const preset = (id: Exclude<PostEasingPresetId, "hold">) =>
    [...EASING_PRESETS[id]] as [number, number, number, number];

  const VARIANTS: Variant[] = [
    {
      id: "default",
      name: "Original",
      note: "Slow start, slow finish",
      curve: null,
    },
    {
      id: "linear",
      name: "Linear",
      note: "Even pace the whole way",
      curve: preset("linear"),
    },
    {
      id: "ease-in",
      name: "Ease in",
      note: "Builds, then the sequence hits the hand-off at full speed",
      curve: preset("ease-in"),
    },
    {
      id: "ease-out",
      name: "Ease out",
      note: "Starts fast, settles gently into the opening pose",
      curve: preset("ease-out"),
    },
    {
      id: "whip",
      name: "Whip, then glide",
      note: "Rips through most of it, long soft landing",
      curve: [0.05, 0.9, 0.2, 1],
    },
    {
      id: "surge",
      name: "Slow, surge, settle",
      note: "Holds back, rushes in the middle, eases out",
      curve: [0.7, 0, 0.2, 1],
    },
  ];

  // The same published quartered LOOP the display-tiles harness uses.
  const SEQUENCE_WORD = "CΨΩXCΨΩXCΨΩXCΨΩX";
  const SEQUENCE_ID = "2077a0d6-01d1-4b2b-a920-da9da6ee7e47";
  const LENGTHS = [3, 4, 5, 6, 8] as const;
  const RESTART_PAUSE = 1.2;

  let sequence = $state<SequenceData | null>(null);
  let loadError = $state<string | null>(null);
  let seconds = $state<number>(5);
  let playing = $state(true);
  let clock = $state(0);
  let frame = 0;
  let last = 0;

  const progress = $derived(Math.min(1, Math.max(0, clock / seconds)));
  const stepCount = $derived(sequence?.steps.length ?? 0);
  const period = $derived(
    sequence ? (sequence.period ?? sequence.orientationCycleCount ?? 1) : 1
  );

  /** How far through its final pass the sequence is, 0 to 1. */
  function passFraction(arrival: number): number {
    const quartered = period === 4 && stepCount % 4 === 0;
    const span = quartered ? stepCount / 4 : stepCount;
    return span ? (arrival - (stepCount - span)) / span : 0;
  }

  function arrivalFor(variant: Variant): number {
    if (!sequence) return 0;
    const curve = variant.curve;
    return tunnelHookArrival(
      progress,
      stepCount,
      period,
      curve ? (p) => sampleEasing(curve, p) : undefined
    );
  }

  function plot(curve: Variant["curve"]): string {
    const ease = curve
      ? (p: number) => sampleEasing(curve, p)
      : (p: number) =>
          p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const points: string[] = [];
    for (let i = 0; i <= 40; i++) {
      const p = i / 40;
      const y = Math.min(1, Math.max(0, ease(p)));
      points.push(`${(p * 100).toFixed(1)},${(100 - y * 100).toFixed(1)}`);
    }
    return points.join(" ");
  }

  function tick(now: number): void {
    if (playing) {
      clock += (now - last) / 1000;
      if (clock > seconds + RESTART_PAUSE) clock = 0;
    }
    last = now;
    frame = requestAnimationFrame(tick);
  }

  onMount(async () => {
    (
      window as unknown as { __tkaLoadProgress?: (p: number) => void }
    ).__tkaLoadProgress?.(100);
    registerLoopDetector(loopDetector);
    try {
      const loaded = await getBrowseLoader().loadFullSequenceData(
        SEQUENCE_WORD,
        SEQUENCE_ID
      );
      if (!loaded) throw new Error("The sample sequence is not published.");
      sequence = await hydrateSequence(loaded);
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Could not load the sequence.";
    }
    last = performance.now();
    frame = requestAnimationFrame(tick);
  });
  onDestroy(() => cancelAnimationFrame(frame));

  function fmt(value: number): string {
    return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
</script>

<svelte:head><title>Hook speed variations</title></svelte:head>

<main>
  <header>
    <h1>Hook speed variations</h1>
    <p>
      The same opening hook with six speed curves. Press play, or drag the
      slider to step through. Copy the four numbers under a tile into the
      editor's Speed curve to use it.
    </p>
    <div class="controls">
      <button type="button" onclick={() => (playing = !playing)}>
        {playing ? "Pause" : "Play"}
      </button>
      <label>
        Hook length
        <select
          bind:value={seconds}
          onchange={() => (clock = 0)}
          aria-label="Hook length"
        >
          {#each LENGTHS as length (length)}
            <option value={length}>{length} s</option>
          {/each}
        </select>
      </label>
      <input
        type="range"
        min="0"
        max={seconds}
        step="0.01"
        value={Math.min(clock, seconds)}
        aria-label="Playhead"
        oninput={(event) => {
          playing = false;
          clock = Number(event.currentTarget.value);
        }}
      />
      <output>{Math.min(clock, seconds).toFixed(2)} s</output>
    </div>
  </header>

  {#if loadError}
    <p class="error">{loadError}</p>
  {:else if !sequence}
    <p>Loading the sample sequence…</p>
  {:else}
    <section class="grid" aria-label="Speed curves">
      {#each VARIANTS as variant (variant.id)}
        {@const arrival = arrivalFor(variant)}
        <article>
          <div class="stage">
            <PostStudioSequenceAnimationLayer
              {sequence}
              sequencePosition={arrival + 1}
              displayedBeatNumber={Math.min(stepCount, Math.floor(arrival) + 1)}
              playing={false}
              tunnelHook={{ hook: DEFAULT_TUNNEL_HOOK, progress }}
            />
          </div>
          <h2>{variant.name}</h2>
          <p class="note">{variant.note}</p>
          <svg viewBox="-4 -4 108 108" class="curve" aria-hidden="true">
            <rect x="0" y="0" width="100" height="100" class="box" />
            <polyline points={plot(variant.curve)} class="line" />
            <circle
              cx={progress * 100}
              cy={100 - passFraction(arrival) * 100}
              r="3.5"
              class="dot"
            />
          </svg>
          <code>
            {variant.curve
              ? variant.curve.map(fmt).join(", ")
              : "original (no curve set)"}
          </code>
        </article>
      {/each}
    </section>
  {/if}
</main>

<style>
  main {
    min-height: 100vh;
    padding: 1.5rem 16px 3rem;
    background: #0b0b10;
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
  }

  header p {
    margin: 0 0 1rem;
    max-width: 60ch;
    color: #a8a8b8;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    margin-bottom: 1.5rem;
  }

  .controls button,
  .controls select {
    min-height: 44px;
    padding: 0 1rem;
    border: 1px solid #3a3a4c;
    border-radius: 8px;
    background: #17171f;
    color: inherit;
    font: inherit;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .controls input[type="range"] {
    flex: 1 1 14rem;
    min-width: 10rem;
  }

  output {
    min-width: 4.5rem;
    font-variant-numeric: tabular-nums;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
    gap: 1.25rem;
  }

  article {
    display: grid;
    gap: 0.4rem;
    padding: 0.75rem;
    border: 1px solid #2a2a38;
    border-radius: 12px;
    background: #12121a;
  }

  .stage {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 8px;
    background: #08080c;
  }

  h2 {
    margin: 0.25rem 0 0;
    font-size: 1rem;
  }

  .note {
    margin: 0;
    min-height: 2.6em;
    color: #a8a8b8;
    font-size: 0.85rem;
  }

  .curve {
    width: 100%;
    max-width: 9rem;
  }

  .box {
    fill: none;
    stroke: #33334a;
    stroke-width: 1;
  }

  .line {
    fill: none;
    stroke: #8b8bff;
    stroke-width: 2.5;
  }

  .dot {
    fill: #ff5a5a;
  }

  code {
    font-size: 0.8rem;
    color: #c9c9ff;
  }

  .error {
    color: #ff8a8a;
  }
</style>
