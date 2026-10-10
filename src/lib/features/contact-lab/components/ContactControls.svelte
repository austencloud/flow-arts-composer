<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getContactLabContext } from "../context/contact-lab-context";
  import type { ContactCameraPreset } from "../state/contact-lab-state.svelte";

  const labState = getContactLabContext();
  const cameraOptions: {
    value: ContactCameraPreset;
    label: string;
    shortLabel: string;
  }[] = [
    { value: "teaching", label: "Teaching angle", shortLabel: "Teach" },
    { value: "top", label: "True top view", shortLabel: "Top" },
    { value: "low", label: "Low hand-level view", shortLabel: "Low" },
  ];

  function handleScrub(event: Event): void {
    labState.setPhase(Number((event.currentTarget as HTMLInputElement).value));
  }
</script>

<div class="contact-controls">
  <div class="transport">
    <PanelButton
      variant="primary"
      onclick={labState.togglePlayback}
      ariaLabel={labState.playing
        ? "Pause contact motion"
        : "Play contact motion"}
    >
      <i
        class="fas {labState.playing ? 'fa-pause' : 'fa-play'}"
        aria-hidden="true"
      ></i>
      <span>{labState.playing ? "Pause" : "Play"}</span>
    </PanelButton>
    <PanelButton
      variant="secondary"
      onclick={labState.reset}
      ariaLabel="Reset contact motion"
    >
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      <span>Reset</span>
    </PanelButton>
  </div>

  <label class="scrubber">
    <span class="sr-only">Loop position</span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.001"
      value={labState.phase}
      oninput={handleScrub}
    />
    <span class="tempo">{labState.bpm} BPM</span>
  </label>

  <div class="camera-control">
    <SegmentedControl
      options={cameraOptions}
      value={labState.cameraPreset}
      onchange={labState.setCameraPreset}
      color="accent"
      size="sm"
      semantics="radiogroup"
      ariaLabel="Contact camera angle"
    />
  </div>
</div>

<style>
  .contact-controls {
    --font-size-sm: clamp(0.875rem, 0.45cqw, 1.25rem);
    --min-touch-target: clamp(44px, 2.2cqh, 64px);
    position: absolute;
    z-index: 10;
    left: 50%;
    bottom: clamp(0.8rem, 2cqh, 1.5rem);
    display: grid;
    grid-template-columns: auto minmax(12rem, 30rem) minmax(13rem, 18rem);
    align-items: center;
    gap: 1rem;
    width: min(clamp(60rem, 55cqw, 110rem), calc(100% - 2rem));
    padding: clamp(0.75rem, 0.6cqw, 1.2rem);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 1rem;
    background: var(--theme-panel-bg, rgba(7, 11, 21, 0.9));
    box-shadow: 0 1.2rem 3rem rgba(0, 0, 0, 0.42);
    transform: translateX(-50%);
  }

  .transport {
    display: flex;
    gap: 0.55rem;
  }

  .scrubber {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  input[type="range"] {
    width: 100%;
    min-height: clamp(2.75rem, 2.6cqh, 4rem);
    accent-color: var(--theme-accent, #5c8dff);
    cursor: pointer;
  }

  .tempo {
    min-width: 5.2ch;
    color: var(--theme-text-secondary, rgba(232, 237, 249, 0.65));
    font-size: clamp(0.78rem, 0.42cqw, 1.15rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .camera-control {
    width: 100%;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @container (max-width: 58rem) {
    .contact-controls {
      grid-template-columns: auto 1fr;
    }

    .camera-control {
      grid-column: 1 / -1;
      max-width: 22rem;
      justify-self: center;
    }
  }

  @container (max-width: 36rem) {
    .contact-controls {
      grid-template-columns: 1fr;
      gap: 0.45rem;
      width: calc(100% - 1rem);
      padding: 0.55rem;
    }

    .transport,
    .camera-control {
      grid-column: auto;
      justify-self: stretch;
    }

    .transport > :global(*) {
      flex: 1;
    }
  }

  @container (max-height: 31rem) {
    .contact-controls {
      right: 0.65rem;
      bottom: 0.65rem;
      left: auto;
      grid-template-columns: auto minmax(10rem, 18rem);
      width: auto;
      transform: none;
    }

    .camera-control {
      display: none;
    }
  }
</style>
