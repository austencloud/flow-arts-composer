<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import type {
    BreakdownFraming,
    BreakdownSection,
  } from "$lib/shared/media-composition/domain/post-studio-breakdown";

  let {
    layout,
    section,
    framing,
    playheadSeconds,
    timingDetail,
    alignedBpm,
    firstBeatSeconds,
    hasPerformance,
    onLayout,
    onMarker,
    onFraming,
    onTapBeats,
    onBpmChange,
    onAlignFirstBeat,
    onNudgeFirstBeat,
    onClearBpmAlignment,
  }: {
    layout: "split" | "breakdown";
    section: BreakdownSection | null;
    framing: BreakdownFraming;
    playheadSeconds: number;
    timingDetail: string | null;
    alignedBpm: number | null;
    firstBeatSeconds: number | null;
    hasPerformance: boolean;
    onLayout: (layout: "split" | "breakdown") => void;
    onMarker: (which: "start" | "end", seconds: number) => void;
    onFraming: (framing: BreakdownFraming) => void;
    onTapBeats: () => void;
    onBpmChange: (bpm: number | null) => void;
    onAlignFirstBeat: () => void;
    onNudgeFirstBeat: (deltaSeconds: number) => void;
    onClearBpmAlignment: () => void;
  } = $props();

  const layoutOptions = [
    { value: "split", label: "Split" },
    { value: "breakdown", label: "Breakdown" },
  ] as const;
  const framingOptions = [
    { value: "fit", label: "Fit" },
    { value: "fill", label: "Fill" },
    { value: "behind", label: "Behind" },
  ] as const;

  const framingDetails: Record<BreakdownFraming, string> = {
    fit: "Keep the whole performance visible in its frame.",
    fill: "Fill the frame, cropping the performance edges if needed.",
    behind: "Keep the performance behind the notation.",
  };

  function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${String(Math.floor((seconds - whole) * 10)).padStart(1, "0")}`;
  }

  function beatClock(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
  }

  function changeBpm(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    const bpm = Number(value);
    onBpmChange(
      value !== "" && Number.isFinite(bpm) && bpm >= 20 && bpm <= 300
        ? bpm
        : null
    );
  }
</script>

<section class="breakdown-controls" aria-label="Post layout">
  <div class="control-group layout-group">
    <div class="control-heading"><strong>Layout</strong></div>
    <SegmentedControl
      options={[...layoutOptions]}
      value={layout}
      onchange={onLayout}
      ariaLabel="Post layout"
      size="sm"
      density="tight"
    />
  </div>

  {#if layout === "breakdown"}
    <div class="breakdown-details" transition:growFade={{ axis: "y" }}>
      <div class="control-group section-group">
        <div class="control-heading"><strong>Breakdown section</strong></div>
        <div class="marker-list">
          <div class="marker-row">
            <span class="marker-name">Start</span>
            <output>{section ? clock(section.startSeconds) : "—"}</output>
            <PanelButton
              type="button"
              onclick={() => onMarker("start", playheadSeconds)}
              >Set to playhead</PanelButton
            >
          </div>
          <div class="marker-row">
            <span class="marker-name">End</span>
            <output>{section ? clock(section.endSeconds) : "—"}</output>
            <PanelButton
              type="button"
              onclick={() => onMarker("end", playheadSeconds)}
              >Set to playhead</PanelButton
            >
          </div>
        </div>
      </div>

      <div class="control-group framing-group">
        <div class="control-heading">
          <strong>Performance during Breakdown</strong>
        </div>
        <SegmentedControl
          options={[...framingOptions]}
          value={framing}
          onchange={onFraming}
          ariaLabel="Performance framing"
          size="sm"
          density="tight"
        />
        <p class="framing-detail">{framingDetails[framing]}</p>
      </div>

      <div class="timing-row">
        <div class="timing-copy">
          <strong>Timing</strong>
          <small>{timingDetail ?? "Choose a performance video"}</small>
        </div>
        <PanelButton
          type="button"
          onclick={onTapBeats}
          disabled={!hasPerformance}>Tap beats</PanelButton
        >
      </div>

      {#if hasPerformance}
        <div class="bpm-controls" aria-label="BPM alignment">
          <div class="bpm-heading">
            <strong>Align by BPM</strong>
            {#if alignedBpm !== null || firstBeatSeconds !== null}
              <PanelButton type="button" onclick={onClearBpmAlignment}
                >Clear BPM</PanelButton
              >
            {/if}
          </div>
          <p class="bpm-guidance">
            Enter the video's tempo, then pause where move 1 lands and set Beat
            1. Tap beats to mark changing timing by hand.
          </p>
          <div class="bpm-entry">
            <label for="post-studio-bpm">BPM</label>
            <input
              id="post-studio-bpm"
              type="number"
              min="20"
              max="300"
              step="any"
              inputmode="decimal"
              value={alignedBpm ?? ""}
              placeholder="e.g. 87"
              onchange={changeBpm}
            />
            <PanelButton
              type="button"
              onclick={onAlignFirstBeat}
              disabled={alignedBpm === null}>Beat 1 at playhead</PanelButton
            >
          </div>
          {#if alignedBpm !== null && firstBeatSeconds !== null}
            <div class="beat-position">
              <span>Beat 1</span>
              <output aria-label="Beat 1 time"
                >{beatClock(firstBeatSeconds)}</output
              >
              <div class="beat-nudge" aria-label="Nudge Beat 1 by one frame">
                <PanelButton
                  type="button"
                  ariaLabel="Move Beat 1 one frame earlier"
                  onclick={() => onNudgeFirstBeat(-1 / 30)}
                  >− 1 frame</PanelButton
                >
                <PanelButton
                  type="button"
                  ariaLabel="Move Beat 1 one frame later"
                  onclick={() => onNudgeFirstBeat(1 / 30)}
                  >+ 1 frame</PanelButton
                >
              </div>
            </div>
            <small class="bpm-status"
              >BPM grid active at {alignedBpm} BPM. Move 1 lands on Beat 1; later
              moves follow their beat durations.</small
            >
          {:else if alignedBpm !== null}
            <small class="bpm-status">Set Beat 1 to start the BPM grid.</small>
          {:else}
            <small class="bpm-status">Enter a BPM to align the breakdown.</small
            >
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .breakdown-controls {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
  }
  .control-group,
  .breakdown-details {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .breakdown-details {
    gap: 0.85rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--theme-stroke, #484755);
  }
  .control-heading {
    color: var(--theme-text, #fff);
    font-size: 0.86rem;
  }
  .marker-list {
    display: grid;
    gap: 0.35rem;
  }
  .marker-row {
    display: grid;
    grid-template-columns: 2.75rem minmax(3.7rem, 1fr) auto;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }
  .marker-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.78rem;
  }
  output {
    min-width: 0;
    color: var(--theme-text, #fff);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .framing-detail {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.75rem;
    line-height: 1.4;
  }
  .timing-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
    padding-top: 0.75rem;
    border-top: 1px solid var(--theme-stroke, #484755);
  }
  .timing-copy {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .timing-copy strong {
    font-size: 0.8rem;
  }
  .timing-copy small {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.73rem;
    overflow-wrap: anywhere;
  }
  .bpm-controls {
    display: grid;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--theme-stroke, #484755);
  }
  .bpm-heading,
  .bpm-entry,
  .beat-position,
  .beat-nudge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .bpm-heading {
    justify-content: space-between;
  }
  .bpm-heading strong,
  .bpm-entry label,
  .beat-position span {
    font-size: 0.8rem;
  }
  .bpm-entry input {
    width: 5.5rem;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.35rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 0.8rem;
  }
  .bpm-entry input:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 2px;
  }
  .bpm-guidance,
  .bpm-status {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.73rem;
    line-height: 1.4;
  }
  .beat-nudge {
    margin-left: auto;
  }
  @container (max-width: 18rem) {
    .marker-row {
      grid-template-columns: 2.75rem minmax(0, 1fr);
    }
    .marker-row :global(button) {
      grid-column: 1 / -1;
    }
    .timing-row {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
