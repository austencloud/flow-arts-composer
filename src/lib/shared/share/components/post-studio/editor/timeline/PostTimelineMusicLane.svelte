<script lang="ts">
  import { POST_TIME_EPSILON } from "$lib/shared/media-composition/domain/post-project";
  import { formatPostClock } from "$lib/shared/share/components/post-studio/builder/post-builder-format";
  import {
    beatSeconds,
    hasGrid,
    isNumberedBar,
    musicBarLabelEvery,
    musicGridLines,
    musicSnapTargets,
    musicSpan,
    postSecondsAtBar,
    trackSecondsAt,
    type MusicPlacement,
  } from "$lib/shared/media-composition/domain/music-grid";
  import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
  import { POST_MUSIC_MIN_SECONDS } from "$lib/shared/media-composition/domain/post-music-edits";
  import {
    placeDraggedMusic,
    roundToFrameSeconds,
    snapToTargets,
  } from "./post-timeline-geometry";

  /**
   * The music's row on the timeline: its waveform, bars and beats, and the
   * drags that move it, trim it and set where bar 1 falls. The parent owns
   * the edits. This hands back post seconds as the pointer moves, except bar
   * 1, which it reports in the file's own seconds.
   */
  interface Props {
    music: PostMusic;
    pixelsPerSecond: number;
    /** Where the post ends. The music past it is not heard, so it is shaded. */
    postEndSeconds: number;
    selected: boolean;
    /** Where an edge or bar 1 may snap: zero, the playhead and the clips' edges. */
    snapTargets: () => number[];
    onSelect: () => void;
    onGestureStart: () => void;
    onGestureEnd: () => void;
    onGestureCancel: () => void;
    onMove: (startSeconds: number) => void;
    onTrim: (edge: "start" | "end", postSeconds: number) => void;
    /** Where bar 1 now falls, in the file's own seconds. */
    onMoveDownbeat: (downbeatSeconds: number) => void;
    onSnapGuide: (seconds: number | null) => void;
  }

  let {
    music,
    pixelsPerSecond,
    postEndSeconds,
    selected,
    snapTargets,
    onSelect,
    onGestureStart,
    onGestureEnd,
    onGestureCancel,
    onMove,
    onTrim,
    onMoveDownbeat,
    onSnapGuide,
  }: Props = $props();

  const DRAG_THRESHOLD_PX = 4;
  /** Beats closer together than this are left out of the lane. Bars stay. */
  const BEAT_LINE_MIN_PX = 6;
  const WAVE_HEIGHT_PX = 40;
  /**
   * The waveform is drawn at no more than this many pixels per second and
   * stretched past it, so zooming in on a long song never draws dozens of
   * screen-wide canvases.
   */
  const WAVE_MAX_PIXELS_PER_SECOND = 100;

  type DragKind = "move" | "start" | "end" | "downbeat";

  interface MusicDrag {
    kind: DragKind;
    pointerId: number;
    startClientX: number;
    didDrag: boolean;
    /** The dragged time when the drag began, in post seconds. */
    from: number;
    /** Where it is now, snapped and clamped. */
    to: number;
    pixelsPerSecond: number;
    targets: number[];
    /** The music when the drag began. The live one changes under the drag. */
    music: PostMusic;
    frame: number | null;
  }

  let drag: MusicDrag | null = null;
  let waveEl = $state<HTMLDivElement | null>(null);

  const span = $derived(musicSpan(music));
  const leftPx = $derived(span.start * pixelsPerSecond);
  const widthPx = $derived((span.end - span.start) * pixelsPerSecond);
  const wavePixelsPerSecond = $derived(
    Math.min(pixelsPerSecond, WAVE_MAX_PIXELS_PER_SECOND)
  );
  // Each line carries its bar and beat, which the markup keys on. A move
  // changes every line's post time but none of their places in the grid, so
  // the same elements stay through it.
  const lines = $derived.by(() => {
    const gridded = music;
    if (!hasGrid(gridded)) return [];
    const beats =
      beatSeconds(gridded.grid) * pixelsPerSecond >= BEAT_LINE_MIN_PX;
    // Only the bars the ruler numbers stand out; the rest draw as beats.
    const every = musicBarLabelEvery(gridded, pixelsPerSecond);
    return musicGridLines(gridded, span.start, span.end)
      .filter((line) => beats || line.downbeat)
      .map((line) => ({
        seconds: line.seconds,
        bar: line.bar,
        beat: line.beat,
        numbered: isNumberedBar(line, every),
      }));
  });
  const barOneSeconds = $derived(barOneAt(music));
  /** Where the part past the post's end begins, from the music's left edge. */
  const pastEndPx = $derived(
    span.end > postEndSeconds + POST_TIME_EPSILON
      ? Math.max(0, (postEndSeconds - span.start) * pixelsPerSecond)
      : null
  );
  // The file's 0 s sits sourceIn before the clip's left edge.
  const waveStyle = $derived(
    `left: ${-music.sourceInSeconds * pixelsPerSecond}px; ` +
      `width: ${music.durationSeconds * wavePixelsPerSecond}px; ` +
      `transform: scaleX(${pixelsPerSecond / wavePixelsPerSecond})`
  );
  const bodyLabel = $derived(
    `Music: ${music.label}, ${formatPostClock(span.start)} to ${formatPostClock(span.end)}`
  );
  const url = $derived(music.url);

  /** Bar 1 on the post's clock, or null when the music doesn't sound it. */
  function barOneAt(placed: PostMusic): number | null {
    if (!hasGrid(placed)) return null;
    const seconds = postSecondsAtBar(placed, 1);
    const { start, end } = musicSpan(placed);
    return seconds >= start - POST_TIME_EPSILON &&
      seconds <= end + POST_TIME_EPSILON
      ? seconds
      : null;
  }

  /** The whole file laid on the post's clock, for the bars a trim can reach. */
  function wholeFile(placed: PostMusic): MusicPlacement {
    return {
      ...placed,
      startSeconds: placed.startSeconds - placed.sourceInSeconds,
      sourceInSeconds: 0,
      sourceOutSeconds: placed.durationSeconds,
    };
  }

  $effect(() => {
    const container = waveEl;
    const source = url;
    if (!container) return;
    let cancelled = false;
    let wave: { destroy(): void } | null = null;
    void import("wavesurfer.js")
      .then(({ default: WaveSurfer }) => {
        if (cancelled) return;
        const color = getComputedStyle(container).color || "#ffffff";
        wave = WaveSurfer.create({
          container,
          url: source,
          height: WAVE_HEIGHT_PX,
          waveColor: color,
          progressColor: color,
          cursorWidth: 0,
          interact: false,
          autoScroll: false,
          autoCenter: false,
          hideScrollbar: true,
          fillParent: true,
          normalize: true,
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
        });
      })
      .catch(() => {
        // Without its waveform the lane still shows the music's place and grid.
      });
    return () => {
      cancelled = true;
      wave?.destroy();
    };
  });

  function beginDrag(event: PointerEvent, kind: DragKind): void {
    if (event.button !== 0) return;
    // The row underneath clears the selection on its own pointerdown.
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const from =
      kind === "move"
        ? music.startSeconds
        : kind === "start"
          ? span.start
          : kind === "end"
            ? span.end
            : (barOneSeconds ?? span.start);
    const others = snapTargets();
    // An edge or bar 1 may also land on the song's own bars and beats, so a
    // trim ends on the beat and bar 1 moves by whole beats, keeping the beat
    // that tapping along found. The whole file's, since a trim reaches past
    // what plays now.
    const ownBeats = musicSnapTargets(wholeFile(music), pixelsPerSecond);
    drag = {
      kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      didDrag: false,
      from,
      to: from,
      pixelsPerSecond,
      targets: kind === "move" ? others : [...others, ...ownBeats],
      music,
      frame: null,
    };
  }

  function place(
    state: MusicDrag,
    raw: number
  ): { seconds: number; guide: number | null } {
    const placed = state.music;
    const { start, end } = musicSpan(placed);
    if (state.kind === "move") {
      const anchors = [0, end - start];
      const barOne = barOneAt(placed);
      if (barOne !== null) anchors.push(barOne - start);
      const moved = placeDraggedMusic(
        raw,
        anchors,
        state.targets,
        state.pixelsPerSecond
      );
      return { seconds: moved.start, guide: moved.guideSeconds };
    }
    const snapped = snapToTargets(raw, state.targets, state.pixelsPerSecond);
    const free =
      snapped.snappedToSeconds === null
        ? roundToFrameSeconds(raw)
        : snapped.seconds;
    const [low, high] =
      state.kind === "start"
        ? [
            Math.max(0, start - placed.sourceInSeconds),
            end - POST_MUSIC_MIN_SECONDS,
          ]
        : state.kind === "end"
          ? [
              start + POST_MUSIC_MIN_SECONDS,
              start + (placed.durationSeconds - placed.sourceInSeconds),
            ]
          : [start, end];
    const seconds = Math.min(high, Math.max(low, free));
    // A clamp can pull the edge back off its target; the guide shows only on it.
    const onTarget =
      snapped.snappedToSeconds !== null &&
      Math.abs(seconds - snapped.snappedToSeconds) < POST_TIME_EPSILON;
    return { seconds, guide: onTarget ? snapped.snappedToSeconds : null };
  }

  function emit(state: MusicDrag): void {
    if (state.kind === "move") onMove(state.to);
    else if (state.kind === "downbeat")
      onMoveDownbeat(trackSecondsAt(state.music, state.to));
    else onTrim(state.kind, state.to);
  }

  function finish(): void {
    const state = drag;
    drag = null;
    if (!state) return;
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    if (state.didDrag) onSnapGuide(null);
  }

  function handlePointerMove(event: PointerEvent): void {
    const state = drag;
    if (!state || event.pointerId !== state.pointerId) return;
    const deltaPx = event.clientX - state.startClientX;
    if (!state.didDrag) {
      if (Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return;
      state.didDrag = true;
      if (!selected) onSelect();
      onGestureStart();
    }
    const placed = place(state, state.from + deltaPx / state.pixelsPerSecond);
    state.to = placed.seconds;
    onSnapGuide(placed.guide);
    if (state.frame === null)
      state.frame = requestAnimationFrame(() => {
        state.frame = null;
        if (drag === state) emit(state);
      });
  }

  function handlePointerUp(event: PointerEvent): void {
    const state = drag;
    if (!state || event.pointerId !== state.pointerId) return;
    if (state.didDrag) {
      // A drag back to where it began changes nothing.
      if (Math.abs(state.to - state.from) < POST_TIME_EPSILON)
        onGestureCancel();
      else {
        emit(state);
        onGestureEnd();
      }
    }
    finish();
  }

  function handlePointerCancel(event: PointerEvent): void {
    const state = drag;
    if (!state || event.pointerId !== state.pointerId) return;
    if (state.didDrag) onGestureCancel();
    finish();
  }

  // Runs while the key is on its way down, before the editor's own Escape
  // (which clears the selection), and keeps the key to the drag it cancels.
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.didDrag) onGestureCancel();
    finish();
  }
</script>

<svelte:window
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
  onkeydowncapture={handleKeydown}
/>

<div class="music-lane">
  <div
    class="music-clip"
    class:selected
    style="left: {leftPx}px; width: {Math.max(widthPx, 2)}px"
  >
    <div
      class="wave"
      bind:this={waveEl}
      aria-hidden="true"
      style={waveStyle}
    ></div>
    {#each lines as line (`${line.bar}:${line.beat}`)}
      <span
        class="grid-line"
        class:bar={line.numbered}
        style="left: {(line.seconds - span.start) * pixelsPerSecond}px"
        aria-hidden="true"
      ></span>
    {/each}
    {#if pastEndPx !== null}
      <span class="past-end" style="left: {pastEndPx}px" aria-hidden="true"
      ></span>
    {/if}
    <button
      type="button"
      class="music-body"
      aria-pressed={selected}
      aria-label={bodyLabel}
      onpointerdown={(event) => beginDrag(event, "move")}
      onclick={onSelect}
    >
      <i class="fa-solid fa-music" aria-hidden="true"></i>
      <span class="music-label">{music.label}</span>
    </button>
  </div>

  {#if selected}
    <button
      type="button"
      class="trim-handle"
      style="left: {leftPx}px"
      aria-label="Trim the music's start"
      onpointerdown={(event) => beginDrag(event, "start")}
    >
      <span class="handle-grip" aria-hidden="true"></span>
    </button>
    <button
      type="button"
      class="trim-handle"
      style="left: {leftPx + widthPx}px"
      aria-label="Trim the music's end"
      onpointerdown={(event) => beginDrag(event, "end")}
    >
      <span class="handle-grip" aria-hidden="true"></span>
    </button>
    {#if barOneSeconds !== null}
      <button
        type="button"
        class="bar-one"
        style="left: {barOneSeconds * pixelsPerSecond}px"
        aria-label="Move bar 1"
        onpointerdown={(event) => beginDrag(event, "downbeat")}
      >
        <span class="flag" aria-hidden="true">1</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  /* Lays its parts straight into the row. Their tint, --music-tint, comes
     from the timeline, which also gives it to the ruler's bar numbers. */
  .music-lane {
    display: contents;
  }

  .music-clip {
    position: absolute;
    top: 3px;
    bottom: 3px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.5rem;
    background: color-mix(
      in srgb,
      var(--music-tint) 18%,
      var(--theme-card-bg, #1c1c26)
    );
  }

  .music-clip.selected {
    border-color: var(--theme-accent);
    box-shadow: inset 0 0 0 2px var(--theme-accent);
  }

  @media (hover: hover) {
    .music-clip:not(.selected):hover {
      border-color: color-mix(
        in srgb,
        var(--music-tint) 60%,
        var(--theme-stroke, rgba(255, 255, 255, 0.14))
      );
    }
  }

  /* The video clip's focus ring, outside the selection ring. */
  .music-clip:has(.music-body:focus-visible) {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .wave {
    position: absolute;
    top: 4px;
    height: 40px;
    transform-origin: 0 50%;
    color: var(--theme-text, #fff);
    opacity: 0.45;
    pointer-events: none;
  }

  .grid-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in srgb, var(--theme-text, #fff) 18%, transparent);
    pointer-events: none;
  }

  .grid-line.bar {
    width: 2px;
    translate: -0.5px 0;
    background: color-mix(in srgb, var(--music-tint) 75%, transparent);
  }

  /* The post ends here, and the music after it is not heard. */
  .past-end {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #08080c) 65%,
      transparent
    );
    pointer-events: none;
  }

  .music-body {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-start;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.3rem 0.5rem;
    border: 0;
    background: transparent;
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-compact, 0.75rem);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  /* A swipe across the timeline scrolls it. Once the music is selected, a
     drag on it moves it instead. */
  .music-clip.selected .music-body {
    touch-action: none;
  }

  /* The ring goes on the strip instead; see .music-clip above. */
  .music-body:focus-visible {
    outline: none;
  }

  .music-body i {
    flex-shrink: 0;
    font-size: 0.85em;
    opacity: 0.85;
  }

  /* A backing keeps the name readable over the waveform and bar lines. */
  .music-label {
    overflow: hidden;
    min-width: 0;
    max-width: 16rem;
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    background: color-mix(
      in srgb,
      var(--theme-card-bg, #1c1c26) 85%,
      transparent
    );
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  .trim-handle {
    position: absolute;
    top: 3px;
    bottom: 3px;
    /* Above bar 1's flag, which can sit on the start edge, and below the
       sticky ruler (5). */
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: ew-resize;
    touch-action: none;
    transform: translateX(-50%);
  }

  .handle-grip {
    width: 4px;
    height: min(60%, 2rem);
    border-radius: 999px;
    background: var(--theme-accent);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-text, #fff) 40%, transparent);
  }

  /* The ring goes on the grip or the flag, not around the wider touch area. */
  .trim-handle:focus-visible,
  .bar-one:focus-visible {
    outline: none;
  }

  .trim-handle:focus-visible .handle-grip {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Bar 1's flag sits on the music's bottom edge, clear of its name. */
  .bar-one {
    position: absolute;
    bottom: 0;
    z-index: 3;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: ew-resize;
    touch-action: none;
    transform: translateX(-50%);
  }

  .flag {
    display: grid;
    place-items: center;
    min-width: 1.25rem;
    height: 1.25rem;
    margin-bottom: 5px;
    border-radius: 0.25rem;
    background: var(--music-tint);
    color: #0b1a10;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
  }

  .bar-one:focus-visible .flag {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
