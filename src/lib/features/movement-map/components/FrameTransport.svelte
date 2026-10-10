<!--
  Moving the playhead precisely.

  Frame stepping is sized by a frame-rate the observer sets, because the footage
  this is built for is deliberately over-cranked: at 120 fps one frame is 8 ms,
  which is fine enough to stop on the instant an arm changes direction. Assuming
  30 fps, as ordinary video tools do, would skip four of every five frames of a
  slow-motion clip and hide exactly the moments worth describing.

  The phase buttons jump to a fraction of the move in progress rather than a
  fixed number of seconds, so "mid" is the real middle of this move whether it
  took a fifth of a second or two seconds.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { PHASE_ANCHORS } from "../domain/movement-annotation";
  import { timeForPhase } from "../domain/step-phase";
  import { FRAME_RATES } from "../state/movement-map-state.svelte";
  import { getMovementMapContext } from "../context/movement-map-context";

  const { state: movementMap } = getMovementMapContext();

  const PLAYBACK_RATES = [0.1, 0.25, 0.5, 1] as const;

  const rateOptions = PLAYBACK_RATES.map((rate) => ({
    value: rate,
    label: `${rate}x speed`,
    shortLabel: `${rate}×`,
  }));

  const frameOptions = FRAME_RATES.map((fps) => ({
    value: fps as number,
    label: `${fps} frames per second`,
    shortLabel: `${fps}`,
  }));

  const frameMs = $derived(Math.round(1000 / movementMap.frameRate));
  /** Keeps a phase jump from landing one frame outside the move it names. */
  const halfFrame = $derived(1 / (movementMap.frameRate * 2));
</script>

<div class="transport">
  <div class="row primary">
    <button
      type="button"
      class="control wide"
      onclick={() => (movementMap.isPlaying = !movementMap.isPlaying)}
      aria-label={movementMap.isPlaying ? "Pause" : "Play"}
    >
      <i
        class={movementMap.isPlaying ? "fas fa-pause" : "fas fa-play"}
        aria-hidden="true"
      ></i>
      <span>{movementMap.isPlaying ? "Pause" : "Play"}</span>
    </button>

    <div class="stepper" role="group" aria-label="Step through frames">
      <button
        type="button"
        class="control"
        onclick={() => movementMap.stepFrames(-10)}
        aria-label="Back 10 frames"
      >
        <i class="fas fa-angles-left" aria-hidden="true"></i>
        <span class="num">10</span>
      </button>
      <button
        type="button"
        class="control"
        onclick={() => movementMap.stepFrames(-1)}
        aria-label="Back one frame"
      >
        <i class="fas fa-angle-left" aria-hidden="true"></i>
        <span class="num">1</span>
      </button>
      <button
        type="button"
        class="control"
        onclick={() => movementMap.stepFrames(1)}
        aria-label="Forward one frame"
      >
        <span class="num">1</span>
        <i class="fas fa-angle-right" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="control"
        onclick={() => movementMap.stepFrames(10)}
        aria-label="Forward 10 frames"
      >
        <span class="num">10</span>
        <i class="fas fa-angles-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <div class="row settings">
    <label class="setting">
      <span class="setting-label">Speed</span>
      <SegmentedControl
        options={rateOptions}
        value={movementMap.playbackRate}
        onchange={(rate: number) => (movementMap.playbackRate = rate)}
        size="sm"
        density="tight"
        ariaLabel="Playback speed"
      />
    </label>

    <label class="setting">
      <span class="setting-label">
        Footage fps
        <em>one frame = {frameMs}ms</em>
      </span>
      <SegmentedControl
        options={frameOptions}
        value={movementMap.frameRate}
        onchange={(fps: number) => (movementMap.frameRate = fps)}
        size="sm"
        density="tight"
        ariaLabel="Frame rate of the footage"
      />
    </label>
  </div>

  {#if movementMap.position}
    {@const position = movementMap.position}
    <div class="row phases">
      <span class="setting-label">Jump within this move</span>
      <div class="phase-chips">
        {#each PHASE_ANCHORS as anchor (anchor.id)}
          <FilterChipBase
            label={anchor.label}
            mode="action"
            size="sm"
            onclick={() =>
              movementMap.seek(
                timeForPhase(position, anchor.phase, halfFrame)
              )}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .transport {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .primary {
    gap: 0.75rem;
  }

  .stepper {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .control {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-height: 2.75rem;
    min-width: 2.75rem;
    padding: 0 0.7rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color var(--transition-fast, 120ms) ease,
      border-color var(--transition-fast, 120ms) ease;
  }

  .control:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-accent, #6366f1);
  }

  .control:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .control.wide {
    padding: 0 1rem;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .settings {
    gap: 1rem;
    align-items: flex-end;
  }

  .setting {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .setting-label {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .setting-label em {
    font-style: normal;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-subtle, rgba(255, 255, 255, 0.45));
  }

  .phases {
    gap: 0.5rem;
  }

  .phase-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .control {
      transition: none;
    }
  }
</style>
