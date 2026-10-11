<!--
  PatternTimeline.svelte - paint pattern clips onto a beat grid.

  Click-drag anywhere on the timeline lane to create a clip covering
  those beats. The clip snapshots the currently-selected pattern
  (from PatternPicker) at the moment of painting. Hit play and the
  LedStaffPreview shows whatever pattern is under the playhead as it
  marches through the beats.

  This is the standalone "lab toy" version - no real TKA sequence
  loaded yet, just an abstract beat ruler. Sequence integration comes
  in a follow-up phase.
-->
<script lang="ts">
  import { getPoiContext } from "../context/poi-context";
  import PatternClipRegion from "./PatternClipRegion.svelte";
  import ScrubValue from "#lib/shared/ui/components/ScrubbableNumber.svelte";

  const poi = getPoiContext();

  let timelineEl = $state<HTMLDivElement | null>(null);
  let selectedClipId = $state<string | null>(null);

  // Drag-to-paint state
  let isDragging = $state(false);
  let dragStartBeat = $state(0);
  let dragEndBeat = $state(0);

  // File-drag-from-desktop state
  let fileDragOver = $state(false);
  let fileDragStart = $state(0);
  let fileDragEnd = $state(0);

  const totalSteps = $derived(poi.totalSteps);
  const bpm = $derived(poi.bpm);
  const playheadBeat = $derived(poi.playheadBeat);
  const isPlaying = $derived(poi.isTimelinePlaying);
  const timeline = $derived(poi.patternTimeline);
  // When a real sequence is loaded, its word appears in the header and
  // the Beats scrub is frozen - the sequence's step count is canonical.
  const loadedSequence = $derived(poi.loadedSequence);
  const loadedSteps = $derived(poi.loadedSteps);
  const sequenceWord = $derived(
    loadedSequence ? (loadedSequence.word || loadedSequence.name || null) : null,
  );
  const headerTitle = $derived(
    sequenceWord ? `${sequenceWord} - Pattern Timeline` : "Pattern Timeline",
  );

  // Playhead position as a percentage of the lane width. Playhead lives
  // between beats (fractional), not on a discrete beat grid.
  const playheadPercent = $derived((playheadBeat / totalSteps) * 100);

  // Preview rect while dragging
  const previewStart = $derived(Math.min(dragStartBeat, dragEndBeat));
  const previewEnd = $derived(Math.max(dragStartBeat, dragEndBeat));
  const previewLeft = $derived(((previewStart - 1) / totalSteps) * 100);
  const previewWidth = $derived(
    ((previewEnd - previewStart + 1) / totalSteps) * 100
  );

  // rAF playback loop - when isPlaying, advance the playhead each frame
  $effect(() => {
    if (!isPlaying) return;

    let prevTime = performance.now();
    let rafId = 0;
    let paused = false;

    function tick() {
      if (document.hidden) {
        paused = true;
        return;
      }
      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;
      poi.advancePlayhead(dt);
      rafId = requestAnimationFrame(tick);
    }

    function onVisibilityChange() {
      if (!document.hidden && paused) {
        paused = false;
        prevTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  function getStepFromX(clientX: number): number {
    if (!timelineEl) return 1;
    const rect = timelineEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = x / rect.width;
    return Math.max(1, Math.min(totalSteps, Math.ceil(ratio * totalSteps)));
  }

  function handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const beat = getStepFromX(e.clientX);
    isDragging = true;
    dragStartBeat = beat;
    dragEndBeat = beat;
    selectedClipId = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!isDragging) return;
    dragEndBeat = getStepFromX(e.clientX);
  }

  function handlePointerUp(): void {
    if (!isDragging) return;
    isDragging = false;

    const start = Math.min(dragStartBeat, dragEndBeat);
    const end = Math.max(dragStartBeat, dragEndBeat);
    poi.paintClip(start, end);
  }

  function handleDragOver(e: DragEvent): void {
    // Respond to either a fresh desktop file drag OR a drag originating
    // from the POI image library tile (custom MIME type set in
    // PoiImageLibrary.svelte). Both draw the same drop preview.
    const types = e.dataTransfer?.types;
    if (!types) return;
    const isFile = types.includes("Files");
    const isLibrary = types.includes(
      "application/x-tka-poi-library-id",
    );
    if (!isFile && !isLibrary) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
    const beat = getStepFromX(e.clientX);
    const DEFAULT_SPAN = 4;
    fileDragOver = true;
    fileDragStart = beat;
    fileDragEnd = Math.min(totalSteps, beat + DEFAULT_SPAN - 1);
  }

  function handleDragLeave(e: DragEvent): void {
    // Only clear when leaving the lane itself, not moving between children
    if (e.target === timelineEl) {
      fileDragOver = false;
    }
  }

  async function handleFileDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    fileDragOver = false;

    // Library drag takes precedence over file drag - if both
    // MIME types are present, prefer the precomputed library entry
    // since it skips a file-decode round trip.
    const libraryId = e.dataTransfer?.getData(
      "application/x-tka-poi-library-id",
    );
    if (libraryId) {
      const entry = poi.libraryEntries.find(
        (lib) => lib.id === libraryId,
      );
      if (entry) {
        await poi.dropLibraryEntryAsClip(
          entry,
          fileDragStart,
          fileDragEnd,
        );
      }
      return;
    }

    const file = e.dataTransfer?.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    await poi.dropImageAsClip(file, fileDragStart, fileDragEnd);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
      e.preventDefault();
      poi.deleteClip(selectedClipId);
      selectedClipId = null;
    }
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      poi.setIsTimelinePlaying(!isPlaying);
    }
  }

  function togglePlayback(): void {
    if (!isPlaying) {
      // If we're at the end, rewind to start before playing
      if (playheadBeat >= totalSteps - 0.001) poi.setPlayheadBeat(0);
    }
    poi.setIsTimelinePlaying(!isPlaying);
  }

  function rewind(): void {
    poi.setPlayheadBeat(0);
  }

  function clearAll(): void {
    poi.clearTimeline();
    selectedClipId = null;
  }

  // Beat markers for the ruler
  const beats = $derived(
    Array.from({ length: totalSteps }, (_, i) => i + 1)
  );

  // Blend-zone overlays - one band per clip whose predecessor abuts it,
  // spanning the first `blendSteps` of the clip. Shown only in blend
  // mode so the user can see where crossfades will fire during playback.
  const blendZones = $derived.by(() => {
    if (timeline.transition !== "blend") return [];
    const beats = timeline.blendSteps ?? 1.0;
    if (beats <= 0) return [];
    const zones: Array<{ id: string; leftPct: number; widthPct: number }> = [];
    for (let i = 1; i < timeline.clips.length; i++) {
      const curr = timeline.clips[i]!;
      const prev = timeline.clips[i - 1]!;
      // Only when the previous clip immediately abuts this one
      if (prev.endStep + 1 !== curr.startStep) continue;
      const zoneStart = curr.startStep; // 1-based inclusive
      const zoneEnd = Math.min(curr.endStep + 1, curr.startStep + beats);
      const leftPct = ((zoneStart - 1) / totalSteps) * 100;
      const widthPct = ((zoneEnd - zoneStart) / totalSteps) * 100;
      zones.push({ id: curr.id, leftPct, widthPct });
    }
    return zones;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="pattern-timeline">
  <div class="timeline-header">
    <h3 class="section-title">{headerTitle}</h3>
    <div class="timeline-hint">
      Pick a pattern above, then drag across beats to paint a clip
    </div>
  </div>

  <div class="controls-bar">
    <button
      class="icon-btn"
      onclick={togglePlayback}
      aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
    >
      <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
    </button>

    <button
      class="icon-btn"
      onclick={rewind}
      aria-label="Rewind to start"
      title="Rewind"
    >
      <i class="fas fa-backward-step" aria-hidden="true"></i>
    </button>

    <ScrubValue
      label="BPM"
      value={bpm}
      min={20}
      max={300}
      step={1}
      onchange={(v) => poi.setBpm(v)}
    />

    {#if loadedSequence}
      <!--
        When a sequence drives the beat count we show the value but
        disable interaction - editing it would silently fight the
        sequence. Restyle so it reads as a frozen label, not a control.
      -->
      <div
        class="beats-locked"
        title="Beat count is locked to the loaded sequence"
      >
        <span class="scrub-label">Beats</span>
        <span class="beats-locked-value">{totalSteps}</span>
        <i class="fas fa-lock" aria-hidden="true"></i>
      </div>
    {:else}
      <ScrubValue
        label="Beats"
        value={totalSteps}
        min={1}
        max={64}
        step={1}
        onchange={(v) => poi.setTotalBeats(v)}
      />
    {/if}

    <button
      class="icon-btn"
      class:active={timeline.transition === "blend"}
      onclick={() =>
        poi.setTransitionMode(
          timeline.transition === "blend" ? "hard" : "blend",
        )}
      aria-label={timeline.transition === "blend"
        ? "Blend mode on (click for hard)"
        : "Hard mode on (click for blend)"}
      title="Transition: {timeline.transition}"
    >
      <i
        class="fas {timeline.transition === 'blend' ? 'fa-wave-square' : 'fa-square'}"
        aria-hidden="true"
      ></i>
    </button>

    {#if timeline.transition === "blend"}
      <ScrubValue
        label="Fade"
        value={timeline.blendSteps ?? 1.0}
        min={0.25}
        max={4.0}
        step={0.25}
        unit=" beats"
        format={(v) => v.toFixed(2)}
        onchange={(v) => poi.setBlendSteps(v)}
      />
    {/if}

    <button
      class="text-btn"
      onclick={clearAll}
      disabled={timeline.clips.length === 0}
      aria-label="Clear all clips"
    >
      Clear
    </button>
  </div>

  <div class="beat-ruler">
    {#each beats as beat (beat)}
      {@const step = loadedSteps[beat - 1]}
      {@const letter = step?.letter ?? null}
      <div class="beat-marker" style:width="{100 / totalSteps}%">
        <span class="beat-number">{beat}</span>
        {#if letter}
          <span class="beat-letter">{letter}</span>
        {/if}
      </div>
    {/each}
  </div>

  <div
    class="timeline-lane"
    bind:this={timelineEl}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleFileDrop}
    role="application"
    aria-label="Pattern timeline - drag to paint pattern clips"
  >
    {#each beats as beat (beat)}
      {#if beat > 1}
        <div
          class="beat-grid-line"
          style:left="{((beat - 1) / totalSteps) * 100}%"
        ></div>
      {/if}
    {/each}

    {#each blendZones as zone (zone.id)}
      <div
        class="blend-zone"
        style:left="{zone.leftPct}%"
        style:width="{zone.widthPct}%"
      ></div>
    {/each}

    {#each timeline.clips as clip (clip.id)}
      <PatternClipRegion
        {clip}
        {totalSteps}
        isSelected={selectedClipId === clip.id}
        onSelect={(id) => (selectedClipId = id)}
      />
    {/each}

    {#if isDragging}
      <div
        class="drag-preview"
        style:left="{previewLeft}%"
        style:width="{previewWidth}%"
      ></div>
    {/if}

    {#if fileDragOver}
      <div
        class="file-drop-preview"
        style:left="{((Math.min(fileDragStart, fileDragEnd) - 1) / totalSteps) * 100}%"
        style:width="{((Math.abs(fileDragEnd - fileDragStart) + 1) / totalSteps) * 100}%"
      >
        <i class="fas fa-image" aria-hidden="true"></i>
      </div>
    {/if}

    <div class="playhead" style:left="{playheadPercent}%"></div>
  </div>
</div>

<style>
  .pattern-timeline {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    user-select: none;
  }

  .timeline-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .section-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-primary, #e2e8f0);
    margin: 0;
  }

  .timeline-hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #94a3b8);
  }

  .controls-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.15));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    color: var(--theme-text-primary, #e2e8f0);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: border-color 0.15s;
    flex-shrink: 0;
  }

  .icon-btn:hover {
    border-color: var(--theme-accent, #3b82f6);
  }

  .icon-btn.active {
    border-color: var(--theme-accent, #3b82f6);
    background: color-mix(in srgb, var(--theme-accent, #3b82f6) 18%, transparent);
    color: var(--theme-accent, #3b82f6);
  }

  .text-btn {
    height: 28px;
    padding: 0 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.15));
    border-radius: 14px;
    background: transparent;
    color: var(--theme-text-secondary, #94a3b8);
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    transition: border-color 0.15s, color 0.15s;
    margin-left: auto;
  }

  .text-btn:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 60%, transparent);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
  }

  .text-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .beat-ruler {
    display: flex;
    min-height: 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .beat-marker {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2px 0;
    gap: 1px;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    min-width: 0;
  }

  .beat-marker:last-child {
    border-right: none;
  }

  .beat-number {
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.4);
    line-height: 1;
  }

  .beat-letter {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-accent, #60a5fa);
    line-height: 1;
    letter-spacing: 0.01em;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: 100%;
    white-space: nowrap;
  }

  .beats-locked {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    border: 1px dashed var(--theme-stroke, rgba(255 255 255 / 0.18));
    background: rgba(255 255 255 / 0.02);
    color: var(--theme-text-secondary, #94a3b8);
    font-size: var(--font-size-compact, 12px);
    cursor: not-allowed;
  }

  .beats-locked .scrub-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #94a3b8);
  }

  .beats-locked-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-primary, #e2e8f0);
    min-width: 24px;
    text-align: center;
  }

  .beats-locked .fa-lock {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.35);
  }

  .timeline-lane {
    position: relative;
    height: 64px;
    background: #08080c;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    cursor: crosshair;
    touch-action: none;
    overflow: hidden;
  }

  /*
    Blend-zone band - shows the user where crossfades will fire between
    abutting clips. Rendered behind the clips themselves via z-index: 1,
    so clip borders still visually win. Diagonal stripes keep it legible
    against the dark lane without screaming for attention.
  */
  .blend-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background-image: repeating-linear-gradient(
      45deg,
      color-mix(in srgb, var(--theme-accent, #3b82f6) 22%, transparent) 0px,
      color-mix(in srgb, var(--theme-accent, #3b82f6) 22%, transparent) 4px,
      color-mix(in srgb, var(--theme-accent, #3b82f6) 5%, transparent) 4px,
      color-mix(in srgb, var(--theme-accent, #3b82f6) 5%, transparent) 8px
    );
    border-left: 1px dashed color-mix(in srgb, var(--theme-accent, #3b82f6) 50%, transparent);
    border-right: 1px dashed color-mix(in srgb, var(--theme-accent, #3b82f6) 30%, transparent);
  }

  .drag-preview {
    position: absolute;
    top: 4px;
    bottom: 4px;
    background: color-mix(in srgb, var(--theme-accent, #3b82f6) 15%, transparent);
    border: 1.5px dashed color-mix(in srgb, var(--theme-accent, #3b82f6) 60%, transparent);
    border-radius: 6px;
    pointer-events: none;
    z-index: 3;
  }

  .file-drop-preview {
    position: absolute;
    top: 4px;
    bottom: 4px;
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 15%, transparent);
    border: 2px dashed color-mix(in srgb, var(--semantic-success, #22c55e) 70%, transparent);
    border-radius: 6px;
    pointer-events: none;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    color: color-mix(in srgb, var(--semantic-success, #22c55e) 90%, transparent);
    font-size: 16px;
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #f59e0b;
    box-shadow: 0 0 8px #f59e0b;
    pointer-events: none;
    z-index: 4;
    transition: none;
  }
</style>
