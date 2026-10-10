<!--
  StepMapTimeline.svelte

  A horizontal timeline bar representing a video's duration, with draggable
  beat markers. Each marker is a vertical line with a circular drag handle.
  Users can click to seek or drag markers to adjust beat timestamps.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  interface Props {
    duration: number;
    currentTime: number;
    beatTimestamps: number[];
    activeStepIndex: number;
    /**
     * What to call each marker. Defaults to its 1-based position, which is
     * wrong wherever the first mark is not a move - the editor marks the
     * opening pose first, so it passes "start" then the move numbers.
     */
    markerLabels?: readonly string[];
    /**
     * Show the marks but do not let them be grabbed. While a run is being
     * marked the bar is for scrubbing, and a 44px drag handle sitting on every
     * mark would swallow exactly the pointer-downs used to rewind to one.
     */
    readOnlyMarks?: boolean;
    /**
     * Index of the first mark the host considers provisional - everything the
     * next tap would replace. Drawn faint, so rewinding shows what is at stake.
     */
    provisionalFrom?: number;
    /**
     * Marks that open a repeat of the sequence. Drawn as a full-height tick and
     * always labelled: a clip performed four times over carries sixty-five
     * marks, and without the pass boundaries that is an unreadable comb.
     */
    passStartIndices?: readonly number[];
    onTimestampChange: (index: number, newTime: number) => void;
    onSeek: (time: number) => void;
    /** Touching a marker makes it the one the host is showing details for. */
    onSelect?: (index: number) => void;
  }

  let {
    duration,
    currentTime,
    beatTimestamps,
    activeStepIndex,
    markerLabels,
    readOnlyMarks = false,
    provisionalFrom = Number.POSITIVE_INFINITY,
    passStartIndices,
    onTimestampChange,
    onSeek,
    onSelect,
  }: Props = $props();

  function labelFor(index: number): string {
    return markerLabels?.[index] ?? String(index + 1);
  }

  const passStarts = $derived(new Set(passStartIndices ?? []));

  /**
   * Below this much room per mark, a 44px grab area covers its neighbours as
   * well as itself and every drag is a coin toss.
   */
  const MIN_GRAB_SPACING_PX = 24;

  /**
   * A clip performed four times over carries sixty-five marks. Handing all of
   * them a handle produces a row of overlapping circles where grabbing the one
   * you meant is luck, so past the spacing above only the selected mark keeps
   * its handle - the rest are ticks, and pressing the bar picks the nearest.
   */
  const denseMarks = $derived(
    !readOnlyMarks &&
      beatTimestamps.length > 1 &&
      timelineWidth > 0 &&
      timelineWidth / beatTimestamps.length < MIN_GRAB_SPACING_PX
  );

  function grabbable(index: number): boolean {
    if (readOnlyMarks) return false;
    return !denseMarks || index === activeStepIndex;
  }

  function nearestMarkTo(time: number): number {
    let nearest = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < beatTimestamps.length; i++) {
      const distance = Math.abs(beatTimestamps[i]! - time);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    }
    return nearest;
  }

  /** Where the last scrub left the playhead, so releasing can select there. */
  let lastScrubTime = $state(0);

  let timelineEl: HTMLDivElement | undefined = $state();
  let draggingIndex = $state(-1);
  let isScrubbing = $state(false);
  let timelineWidth = $state(0);

  /**
   * Which markers get a number. Thinned by where the marks actually SIT rather
   * than by how many there are: a run in progress piles every mark it has into
   * the part of the clip already watched, so a stride computed from the count
   * against the full width leaves them printing over each other. Walking the
   * positions and keeping a minimum gap handles a crowded run and a spread one
   * with the same rule. Pass starts and the active mark always show.
   */
  const LABEL_MIN_GAP_PX = 26;
  const labelIndices = $derived.by(() => {
    const shown = new Set<number>();
    if (duration <= 0 || timelineWidth <= 0) return shown;
    let lastX = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < beatTimestamps.length; i++) {
      const x = (beatTimestamps[i]! / duration) * timelineWidth;
      if (passStarts.has(i) || i === activeStepIndex) {
        shown.add(i);
        lastX = x;
        continue;
      }
      if (x - lastX >= LABEL_MIN_GAP_PX) {
        shown.add(i);
        lastX = x;
      }
    }
    return shown;
  });

  // The fraction of the timeline that's been played (0 to 1)
  let progressFraction = $derived(
    duration > 0 ? Math.min(currentTime / duration, 1) : 0
  );

  function getTimeFromPointer(clientX: number): number {
    if (!timelineEl || duration <= 0) return 0;
    const rect = timelineEl.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width)
    );
    return fraction * duration;
  }

  function clampTimestamp(index: number, time: number): number {
    // Markers can't cross their neighbors. Leave a 0.05s minimum gap.
    const gap = 0.05;
    const min = index > 0 ? beatTimestamps[index - 1]! + gap : 0;
    const max =
      index < beatTimestamps.length - 1
        ? beatTimestamps[index + 1]! - gap
        : duration;
    return Math.max(min, Math.min(max, time));
  }

  function handleTimelinePointerDown(event: PointerEvent) {
    // If tapping a marker handle, let that handler take over
    if (draggingIndex >= 0) return;

    // Start scrubbing - seek immediately and continue on move
    isScrubbing = true;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const time = getTimeFromPointer(event.clientX);
    lastScrubTime = time;
    onSeek(time);
    if (denseMarks) selectNearest(time);
  }

  /** Pressing the bar adopts the mark you pressed next to, so a crowded run
      is still reachable one mark at a time. */
  function selectNearest(time: number): void {
    const index = nearestMarkTo(time);
    if (index >= 0) onSelect?.(index);
  }

  function handleMarkerPointerDown(event: PointerEvent, index: number) {
    event.stopPropagation();
    event.preventDefault();
    draggingIndex = index;
    onSelect?.(index);

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (draggingIndex >= 0) {
      // Dragging a beat marker
      const rawTime = getTimeFromPointer(event.clientX);
      const clamped = clampTimestamp(draggingIndex, rawTime);
      onTimestampChange(draggingIndex, clamped);
    } else if (isScrubbing) {
      // Scrubbing the playhead
      const time = getTimeFromPointer(event.clientX);
      lastScrubTime = time;
      onSeek(time);
    }
  }

  function handlePointerUp() {
    // Adopt the mark the scrub finished next to, not the one it began at.
    if (isScrubbing && denseMarks) selectNearest(lastScrubTime);
    draggingIndex = -1;
    isScrubbing = false;
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="timeline-container"
  bind:this={timelineEl}
  bind:clientWidth={timelineWidth}
  onpointerdown={handleTimelinePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  role="slider"
  aria-label={t("viewer_ui_step_timing")}
  aria-valuemin={0}
  aria-valuemax={duration}
  aria-valuenow={currentTime}
  tabindex={0}
>
  <!-- Move number labels above the bar -->
  <div class="beat-labels" aria-hidden="true">
    {#each beatTimestamps as ts, i}
      {@const pct = duration > 0 ? (ts / duration) * 100 : 0}
      {#if labelIndices.has(i)}
        <span
          class="beat-label"
          class:active={i === activeStepIndex}
          class:pass-start={passStarts.has(i)}
          style="left: {pct}%"
        >
          {labelFor(i)}
        </span>
      {/if}
    {/each}
  </div>

  <!-- The actual timeline bar -->
  <div class="timeline-bar">
    <!-- Progress fill -->
    <div class="progress-fill" style="width: {progressFraction * 100}%"></div>

    <!-- Playhead indicator -->
    <div class="playhead" style="left: {progressFraction * 100}%"></div>

    <!-- Beat markers -->
    {#each beatTimestamps as ts, i}
      {@const pct = duration > 0 ? (ts / duration) * 100 : 0}
      {#if !grabbable(i)}
        <!-- Decorative: the container slider already reports the position, and
             these cannot be adjusted - either a run is being marked, or the
             marks are too crowded to grab and the bar picks them instead. -->
        <div
          class="beat-marker readonly"
          class:active={i === activeStepIndex}
          class:pass-start={passStarts.has(i)}
          class:provisional={i >= provisionalFrom}
          style="left: {pct}%"
          aria-hidden="true"
        >
          <div class="marker-line"></div>
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="beat-marker"
          class:active={i === activeStepIndex}
          class:pass-start={passStarts.has(i)}
          class:dragging={i === draggingIndex}
          style="left: {pct}%"
          onpointerdown={(e) => handleMarkerPointerDown(e, i)}
          role="slider"
          aria-label="Mark {labelFor(i)} at {formatTime(ts)}"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={ts}
          tabindex={0}
        >
          <div class="marker-line"></div>
          <div class="marker-handle"></div>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Time display -->
  <div class="time-display">
    <span class="time-current">{formatTime(currentTime)}</span>
    <span class="time-total">{formatTime(duration)}</span>
  </div>
</div>

<style>
  .timeline-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0;
    user-select: none;
    touch-action: none;
    cursor: pointer;
  }

  .beat-labels {
    position: relative;
    /* Reserved so the row never changes height as labels thin in and out. */
    height: 1rem;
  }

  .beat-label {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: var(--font-size-compact, 12px);
    line-height: 1;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .beat-label.active {
    color: var(--theme-accent, #6366f1);
    font-weight: 700;
  }

  /* Where the sequence starts over. Brighter than its neighbours because it is
     the one label that says something they do not: a new pass begins here. */
  .beat-label.pass-start {
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    font-weight: 700;
  }

  .timeline-bar {
    position: relative;
    /* The host scales this on very wide panels, where a 48px bar spanning
       2700px reads as a hairline rather than a scrubbing surface. */
    height: var(--timeline-bar-height, 48px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    overflow: visible;
  }

  .progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 15%,
      transparent
    );
    border-radius: 7px 0 0 7px;
    pointer-events: none;
    transition: width 0.05s linear;
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--theme-text, #ffffff);
    opacity: 0.8;
    transform: translateX(-1px);
    pointer-events: none;
    z-index: 2;
    transition: left 0.05s linear;
  }

  .beat-marker {
    position: absolute;
    top: -6px;
    bottom: -6px;
    width: 44px;
    transform: translateX(-22px);
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: grab;
    z-index: 3;
    touch-action: none;
  }

  .beat-marker:active,
  .beat-marker.dragging {
    cursor: grabbing;
  }

  /* Ticks, not handles: every pointer-down goes through to the bar underneath,
     so the crowded area around a mark is still scrubbable. */
  .beat-marker.readonly {
    width: 2px;
    transform: translateX(-1px);
    pointer-events: none;
    cursor: default;
  }

  /* Marks the next tap would replace, drawn faint so rewinding shows the cost
     before it is paid. */
  .beat-marker.provisional .marker-line {
    opacity: 0.35;
  }

  .marker-line {
    position: absolute;
    top: 6px;
    bottom: 6px;
    width: 2px;
    background: var(--theme-text-muted, rgba(255, 255, 255, 0.35));
    border-radius: 1px;
    transition: background 0.15s ease;
  }

  /* A repeat boundary: taller and brighter than the marks inside a pass, so
     four passes read as four blocks rather than one comb of sixty-five ticks.
     This is structure in the data, present whatever is selected. */
  .beat-marker.pass-start .marker-line {
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--theme-text, rgba(255, 255, 255, 0.8));
  }

  .beat-marker.active .marker-line {
    background: var(--theme-accent, #6366f1);
    box-shadow: 0 0 6px
      color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
  }

  .beat-marker.dragging .marker-line {
    background: var(--theme-accent, #6366f1);
  }

  .marker-handle {
    position: absolute;
    top: -2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(30, 30, 40, 1));
    border: 2px solid var(--theme-text-muted, rgba(255, 255, 255, 0.35));
    transition:
      border-color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .beat-marker:hover .marker-handle {
    border-color: var(--theme-text, #ffffff);
    transform: scale(1.15);
  }

  .beat-marker.active .marker-handle {
    border-color: var(--theme-accent, #6366f1);
    background: var(--theme-accent, #6366f1);
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--theme-accent, #6366f1) 60%, transparent);
  }

  .beat-marker.dragging .marker-handle {
    border-color: var(--theme-accent, #6366f1);
    background: var(--theme-accent, #6366f1);
    transform: scale(1.25);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent, #6366f1) 60%, transparent);
  }

  .time-display {
    display: flex;
    justify-content: space-between;
    padding: 0 2px;
  }

  .time-current,
  .time-total {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .marker-line,
    .marker-handle,
    .progress-fill,
    .playhead {
      transition: none !important;
    }

    .beat-marker:hover .marker-handle,
    .beat-marker.dragging .marker-handle {
      transform: none !important;
    }
  }
</style>
