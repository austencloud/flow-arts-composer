<!-- Play, frame and landing steps, scrub and speed for the reference clock. -->
<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  import type { ReferenceSession } from "./reference-session.svelte";

  let { session }: { session: ReferenceSession } = $props();

  // SegmentedControl takes string values.
  const speeds = [
    { value: "0.25", label: "¼×" },
    { value: "0.5", label: "½×" },
    { value: "1", label: "1×" },
  ];
</script>

<div class="transport" aria-label="Reference playback">
  <button
    type="button"
    aria-label="Previous landing"
    disabled={!session.resolved}
    onclick={() => session.stepLanding(-1)}
  >
    <i class="fas fa-backward-step" aria-hidden="true"></i>
  </button>
  <button
    type="button"
    aria-label="Back one frame"
    onclick={() => session.stepFrame(-1)}
  >
    <i class="fas fa-chevron-left" aria-hidden="true"></i>
  </button>
  <button
    type="button"
    class="play"
    aria-label={session.playing ? "Pause" : "Play"}
    onclick={() => (session.playing = !session.playing)}
  >
    <i
      class={session.playing ? "fas fa-pause" : "fas fa-play"}
      aria-hidden="true"
    ></i>
  </button>
  <button
    type="button"
    aria-label="Forward one frame"
    onclick={() => session.stepFrame(1)}
  >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
  </button>
  <button
    type="button"
    aria-label="Next landing"
    disabled={!session.resolved}
    onclick={() => session.stepLanding(1)}
  >
    <i class="fas fa-forward-step" aria-hidden="true"></i>
  </button>
  <input
    type="range"
    aria-label="Video time"
    min="0"
    max={session.durationSeconds || 1}
    step="0.001"
    value={session.time}
    oninput={(event) => {
      session.playing = false;
      session.seek(Number(event.currentTarget.value));
    }}
  />
  <span class="time">{session.time.toFixed(2)} s</span>
  <div class="speed">
    <SegmentedControl
      options={speeds}
      value={String(session.speed)}
      density="tight"
      ariaLabel="Playback speed"
      onchange={(speed) => (session.speed = Number(speed))}
    />
  </div>
</div>

<style>
  .transport {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  button {
    min-width: 44px;
    min-height: 44px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: inherit;
  }
  button:disabled {
    opacity: 0.4;
  }
  /* The scrubber takes the spare width; on a phone it drops to its own row. */
  input[type="range"] {
    flex: 1 1 12rem;
    min-width: 0;
  }
  .speed {
    flex: 0 0 10rem;
  }
  .time {
    font-variant-numeric: tabular-nums;
    min-width: 5ch;
  }
</style>
