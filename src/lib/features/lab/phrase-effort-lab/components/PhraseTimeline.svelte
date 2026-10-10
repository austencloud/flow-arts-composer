<script lang="ts">
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import type { EffortTimeline, EffortPhrase } from "../domain/effort-timeline-types";
  import { createEffortPhrase, insertPhrase } from "../domain/effort-timeline-types";
  import PhraseRegion from "./PhraseRegion.svelte";

  interface Props {
    timeline: EffortTimeline;
    totalSteps: number;
    selectedEffort: EffortId;
    selectedPhraseId: string | null;
    onTimelineChange: (timeline: EffortTimeline) => void;
    onPhraseSelect: (id: string | null) => void;
    currentStep?: number;
  }

  let {
    timeline,
    totalSteps,
    selectedEffort,
    selectedPhraseId,
    onTimelineChange,
    onPhraseSelect,
    currentStep = 0,
  }: Props = $props();

  let timelineEl: HTMLDivElement | undefined = $state();
  let isDragging = $state(false);
  let dragStartBeat = $state(0);
  let dragEndBeat = $state(0);

  const beats = $derived(Array.from({ length: totalSteps }, (_, i) => i + 1));
  const playheadPercent = $derived(
    currentStep > 0 ? ((currentStep - 1) / totalSteps) * 100 : -1
  );

  function getStepFromX(clientX: number): number {
    if (!timelineEl) return 1;
    const rect = timelineEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = x / rect.width;
    return Math.max(1, Math.min(totalSteps, Math.ceil(ratio * totalSteps)));
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const beat = getStepFromX(e.clientX);
    isDragging = true;
    dragStartBeat = beat;
    dragEndBeat = beat;
    onPhraseSelect(null);
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;
    dragEndBeat = getStepFromX(e.clientX);
  }

  function handlePointerUp() {
    if (!isDragging) return;
    isDragging = false;

    const start = Math.min(dragStartBeat, dragEndBeat);
    const end = Math.max(dragStartBeat, dragEndBeat);

    const newPhrase = createEffortPhrase(selectedEffort, start, end);
    const updated = insertPhrase(timeline, newPhrase);
    onTimelineChange(updated);
  }

  const previewStart = $derived(Math.min(dragStartBeat, dragEndBeat));
  const previewEnd = $derived(Math.max(dragStartBeat, dragEndBeat));
  const previewLeft = $derived(((previewStart - 1) / totalSteps) * 100);
  const previewWidth = $derived(((previewEnd - previewStart + 1) / totalSteps) * 100);
</script>

<div class="phrase-timeline-container">
  <div class="beat-ruler">
    {#each beats as beat}
      <div class="beat-marker" style:width="{100 / totalSteps}%">
        <span class="beat-number">{beat}</span>
      </div>
    {/each}
  </div>

  <div
    class="timeline-lane"
    bind:this={timelineEl}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    role="application"
    aria-label="Effort timeline - drag to paint phrases"
  >
    {#each beats as beat}
      <div
        class="beat-grid-line"
        style:left="{((beat - 1) / totalSteps) * 100}%"
      ></div>
    {/each}

    {#each timeline.phrases as phrase (phrase.id)}
      <PhraseRegion
        {phrase}
        {totalSteps}
        isSelected={selectedPhraseId === phrase.id}
        onSelect={onPhraseSelect}
      />
    {/each}

    {#if isDragging}
      <div
        class="drag-preview"
        style:left="{previewLeft}%"
        style:width="{previewWidth}%"
      ></div>
    {/if}

    {#if playheadPercent >= 0}
      <div class="playhead" style:left="{playheadPercent}%"></div>
    {/if}
  </div>
</div>

<style>
  .phrase-timeline-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    user-select: none;
  }

  .beat-ruler {
    display: flex;
    height: 24px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .beat-marker {
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .beat-number {
    font-size: var(--font-size-xs, 11px);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .timeline-lane {
    position: relative;
    height: 56px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    cursor: crosshair;
    touch-action: none;
  }

  .drag-preview {
    position: absolute;
    top: 4px;
    bottom: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1.5px dashed var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    border-radius: 6px;
    pointer-events: none;
    z-index: 3;
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--theme-accent, #8b5cf6);
    box-shadow: 0 0 6px var(--theme-accent, #8b5cf6);
    pointer-events: none;
    z-index: 4;
  }
</style>
