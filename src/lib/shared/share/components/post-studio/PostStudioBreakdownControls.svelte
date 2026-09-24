<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
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
    onLayout,
    onMarker,
    onFraming,
    onTapBeats,
  }: {
    layout: "split" | "breakdown";
    section: BreakdownSection | null;
    framing: BreakdownFraming;
    playheadSeconds: number;
    timingDetail: string | null;
    onLayout: (layout: "split" | "breakdown") => void;
    onMarker: (which: "start" | "end", seconds: number) => void;
    onFraming: (framing: BreakdownFraming) => void;
    onTapBeats: () => void;
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

  function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${String(Math.floor((seconds - whole) * 10)).padStart(1, "0")}`;
  }
</script>

<section class="breakdown-controls" aria-label="Post layout">
  <div class="control-heading"><strong>Layout</strong></div>
  <SegmentedControl
    options={[...layoutOptions]}
    value={layout}
    onchange={onLayout}
    ariaLabel="Post layout"
    size="sm"
  />

  {#if layout === "breakdown"}
    <div class="section-divider"></div>
    <div class="control-heading"><strong>Breakdown section</strong></div>
    <div class="marker-row">
      <span
        >Start <output>{section ? clock(section.startSeconds) : "—"}</output
        ></span
      >
      <button type="button" onclick={() => onMarker("start", playheadSeconds)}
        >Set to playhead</button
      >
    </div>
    <div class="marker-row">
      <span
        >End <output>{section ? clock(section.endSeconds) : "—"}</output></span
      >
      <button type="button" onclick={() => onMarker("end", playheadSeconds)}
        >Set to playhead</button
      >
    </div>
    <div class="control-heading"><strong>Performance framing</strong></div>
    <SegmentedControl
      options={[...framingOptions]}
      value={framing}
      onchange={onFraming}
      ariaLabel="Performance framing"
      size="sm"
    />
    <div class="timing-row">
      <span
        ><strong>Timing</strong><small
          >{timingDetail ?? "Choose a performance video"}</small
        ></span
      >
      <button type="button" onclick={onTapBeats}>Tap beats</button>
    </div>
  {/if}
</section>

<style>
  .breakdown-controls {
    display: grid;
    gap: 0.6rem;
    padding: 0.85rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.85rem;
    background: var(--theme-surface, #17161e);
  }
  .control-heading {
    color: var(--theme-text, #fff);
    font-size: 0.86rem;
  }
  .section-divider {
    height: 1px;
    background: var(--theme-stroke, #484755);
    margin-block: 0.2rem;
  }
  .marker-row,
  .timing-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    min-width: 0;
  }
  .marker-row span {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--theme-text-secondary, #aaa);
  }
  output {
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, #fff);
  }
  button {
    flex: 0 0 auto;
    min-height: 2rem;
    padding: 0.3rem 0.65rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--theme-text, #fff);
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
  }
  button:hover,
  button:focus-visible {
    border-color: var(--theme-accent, #8b7cff);
  }
  .timing-row {
    margin-top: 0.2rem;
  }
  .timing-row span {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .timing-row strong {
    font-size: 0.8rem;
  }
  .timing-row small {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.73rem;
    overflow-wrap: anywhere;
  }
  @container (max-width: 22rem) {
    .marker-row,
    .timing-row {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
