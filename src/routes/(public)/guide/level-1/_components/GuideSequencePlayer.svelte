<script lang="ts">
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import GuidePictograph from "./GuidePictograph.svelte";

  let {
    beats,
    label,
    startLabel,
    beatSize = "sm",
  }: {
    beats: PictographData[];
    label?: string;
    startLabel?: string;
    beatSize?: "sm" | "md" | "lg";
  } = $props();

  let activeStep = $state(-1);
  let playing = $state(false);
  let speed = $state<1 | 0.5>(1);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const bpm = $derived(60 * speed);
  const msPerBeat = $derived(60000 / bpm);

  function play() {
    if (playing) {
      pause();
      return;
    }
    playing = true;
    activeStep = 0;
    intervalId = setInterval(() => {
      activeStep++;
      if (activeStep >= beats.length) {
        pause();
      }
    }, msPerBeat);
  }

  function pause() {
    playing = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function jumpTo(index: number) {
    pause();
    activeStep = index;
  }

  function toggleSpeed() {
    speed = speed === 1 ? 0.5 : 1;
    if (playing) {
      pause();
      play();
    }
  }

  $effect(() => {
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  });
</script>

<div class="guide-sequence-player">
  {#if label}
    <div class="player-label">{label}</div>
  {/if}

  <div class="beat-strip">
    {#if startLabel && beats.length > 0}
      <div
        class="beat-cell start-placement"
        class:active={activeStep === 0}
        role="button"
        tabindex="0"
        onclick={() => jumpTo(0)}
        onkeydown={(e) => e.key === "Enter" && jumpTo(0)}
      >
        <GuidePictograph data={beats[0]} size={beatSize} label={startLabel} bordered />
      </div>
    {/if}
    {#each beats as beat, i}
      {#if !(i === 0 && startLabel)}
        <div
          class="beat-cell"
          class:active={activeStep === i}
          role="button"
          tabindex="0"
          onclick={() => jumpTo(i)}
          onkeydown={(e) => e.key === "Enter" && jumpTo(i)}
        >
          <GuidePictograph data={beat} size={beatSize} label="Step {i + 1}" bordered />
        </div>
      {/if}
    {/each}
  </div>

  <div class="controls">
    <button class="play-btn" onclick={play} aria-label={playing ? "Pause" : "Play"}>
      {#if playing}
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1" y="1" width="4" height="12" fill="currentColor" />
          <rect x="9" y="1" width="4" height="12" fill="currentColor" />
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 14 14">
          <polygon points="2,0 14,7 2,14" fill="currentColor" />
        </svg>
      {/if}
    </button>

    <div class="beat-dots">
      {#each beats as _, i}
        <button
          class="beat-dot"
          class:active={activeStep === i}
          onclick={() => jumpTo(i)}
          aria-label="Step {i + 1}"
        ></button>
      {/each}
    </div>

    <button class="speed-toggle" onclick={toggleSpeed}>
      {speed === 1 ? "1×" : "0.5×"}
    </button>
  </div>
</div>
