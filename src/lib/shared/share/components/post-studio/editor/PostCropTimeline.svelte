<!--
  The crop screen's timeline: the clip alone, as wide as the screen and as
  close as the timeline zooms, with the beats tapped for its take in one row
  and its Crop keyframes, and the curves between them, in the next.

  It works like the editor's timeline. Drag the ruler to move the playhead,
  drag a keyframe to move it, and it snaps to a beat or the playhead when
  close. Press a keyframe to go to it, then Delete removes it and the arrows
  move it a frame. Press a curve to change its easing. The bar above steps a
  frame or a beat at a time, keys the playhead and zooms. Times read from
  the clip's start, as the crop screen shows them. Press the time to type
  one and go there.
-->
<script lang="ts">
  import { tick, untrack, type Snippet } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import TimeRuler from "$lib/shared/timeline/TimeRuler.svelte";
  import {
    POST_FRAME_RATE,
    POST_KEYFRAME_MERGE_SECONDS,
    POST_TIME_EPSILON,
    itemEnd,
    type PostVideoItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import { moveKeyframe } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import TypeableValue from "$lib/shared/ui/components/TypeableValue.svelte";
  import { formatTakeClock, parseClock } from "../builder/post-builder-format";
  import { channelLabel } from "./post-editor-labels";
  import { adjacentStepSeconds, type ClipStep } from "./post-crop-steps";
  import PostTimelineKeyLane from "./timeline/PostTimelineKeyLane.svelte";
  import PostTimelineZoomControls from "./timeline/PostTimelineZoomControls.svelte";
  import {
    autoScrollForPlayhead,
    clampPixelsPerSecond,
    fitPixelsPerSecond,
    pixelsToSeconds,
    revealPlayheadScrollLeft,
    roundToFrameSeconds,
    rulerTickInterval,
    scrollLeftForStableAnchor,
    secondsToPixels,
    snapToTargets,
  } from "./timeline/post-timeline-geometry";

  interface Props {
    editor: PostEditorState;
    item: PostVideoItem;
    /** The take's beats inside the clip, in post seconds. */
    steps: readonly ClipStep[];
    /** A beat's name for its button, counted as the Timing tool counts it. */
    stepName: (step: ClipStep) => string;
    locked: boolean;
    /** The Crop keyframe buttons, from the editor. */
    keys: Snippet;
    /** Play or pause, looping the clip. */
    onToggle: () => void;
    /** Moves the playhead, kept on the clip. */
    onSeek: (seconds: number) => void;
    onMoveKey: (fromSeconds: number, toSeconds: number) => void;
    onDeleteKey: (seconds: number) => void;
    /** A curve pressed: its easing opens from the key it starts at. */
    onOpenCurve: (fromSeconds: number) => void;
  }

  let {
    editor,
    item,
    steps,
    stepName,
    locked,
    keys,
    onToggle,
    onSeek,
    onMoveKey,
    onDeleteKey,
    onOpenCurve,
  }: Props = $props();

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;
  const STEPS_HEIGHT_PX = 36;
  const KEYS_HEIGHT_PX = 44;
  /** Room at either end, so a keyframe on the clip's first or last frame shows whole. */
  const EDGE_PX = 16;
  const DRAG_THRESHOLD_PX = 4;
  const ZOOM_STEP_FACTOR = 1.25;
  /** Beats closer than this on screen draw as ticks, without their count. */
  const STEP_LABEL_MIN_GAP_PX = 22;

  const start = $derived(item.start);
  const end = $derived(itemEnd(item));
  const length = $derived(Math.max(0, end - start));
  const lastFrame = $derived(Math.max(start, end - FRAME_SECONDS));
  const playhead = $derived(editor.previewSeconds);

  let scrollEl = $state<HTMLDivElement | null>(null);
  let laneShiftEl = $state<HTMLDivElement | null>(null);
  let viewportWidthPx = $state(0);
  let pixelsPerSecond = $state(60);
  let fittedFor: string | null = null;
  /** Fitted and not zoomed since, so a new width fits it again. */
  let followFit = false;

  /** Where a moment of the clip sits across the scrolled rows. */
  function xOf(seconds: number): number {
    return EDGE_PX + secondsToPixels(seconds - start, pixelsPerSecond);
  }

  const trackWidthPx = $derived(secondsToPixels(length, pixelsPerSecond));
  const playheadXPx = $derived(xOf(Math.min(end, Math.max(start, playhead))));

  // Fit the clip to the rows when it opens, and again when the rows change
  // width, until it is zoomed by hand.
  $effect(() => {
    const width = viewportWidthPx;
    const key = item.id;
    if (width <= 0 || (fittedFor === key && !followFit)) return;
    fittedFor = key;
    untrack(() => fit());
  });

  function fit(): void {
    pixelsPerSecond = fitPixelsPerSecond(length, viewportWidthPx - 2 * EDGE_PX);
    followFit = true;
    if (scrollEl) scrollEl.scrollLeft = 0;
  }

  function zoomTo(
    requested: number,
    anchorSeconds: number,
    anchorClientXPx: number
  ): void {
    const clamped = clampPixelsPerSecond(requested);
    if (clamped === pixelsPerSecond) return;
    followFit = false;
    pixelsPerSecond = clamped;
    const scroller = scrollEl;
    if (!scroller) return;
    void tick().then(() => {
      scroller.scrollLeft = scrollLeftForStableAnchor({
        anchorSeconds: anchorSeconds - start,
        anchorClientXPx: anchorClientXPx - EDGE_PX,
        newPixelsPerSecond: clamped,
      });
    });
  }

  /** The buttons zoom about the playhead, keeping it where it is. */
  function zoomBy(factor: number): void {
    const scroller = scrollEl;
    const anchorX = scroller ? playheadXPx - scroller.scrollLeft : 0;
    const inView =
      scroller !== null && anchorX >= 0 && anchorX <= scroller.clientWidth;
    zoomTo(
      pixelsPerSecond * factor,
      inView ? playhead : start,
      inView ? anchorX : EDGE_PX
    );
  }

  function handleWheel(event: WheelEvent): void {
    const scroller = scrollEl;
    if (!(event.ctrlKey || event.metaKey) || !scroller) return;
    event.preventDefault();
    const anchorClientXPx =
      event.clientX - scroller.getBoundingClientRect().left;
    const factor = event.deltaY < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
    zoomTo(
      pixelsPerSecond * factor,
      secondsAtClientX(event.clientX),
      anchorClientXPx
    );
  }

  // Keep the playhead in view: following it while playing, and bringing it
  // back after a jump while paused, unless the rows are being scrolled.
  let userScrolling = false;
  let scrollIdle: ReturnType<typeof setTimeout> | undefined;
  let settingScroll = false;

  function handleScroll(): void {
    if (settingScroll) {
      settingScroll = false;
      return;
    }
    userScrolling = true;
    clearTimeout(scrollIdle);
    scrollIdle = setTimeout(() => (userScrolling = false), 200);
  }

  $effect(() => {
    const x = playheadXPx;
    const playing = editor.isPlaying;
    const dragging = drag !== null;
    const scroller = untrack(() => scrollEl);
    if (!scroller || userScrolling || dragging) return;
    // The helpers think in seconds; at one pixel a second they work on the
    // playhead's place across the rows directly.
    const params = {
      playheadSeconds: x,
      pixelsPerSecond: 1,
      scrollLeftPx: scroller.scrollLeft,
      viewportWidthPx: scroller.clientWidth,
    };
    const next = playing
      ? autoScrollForPlayhead(params)
      : revealPlayheadScrollLeft(params);
    if (next === null || Math.abs(next - scroller.scrollLeft) < 1) return;
    settingScroll = true;
    scroller.scrollLeft = next;
  });

  // ---- The playhead --------------------------------------------------------

  function secondsAtClientX(clientX: number): number {
    const scroller = scrollEl;
    if (!scroller) return start;
    const x =
      clientX -
      scroller.getBoundingClientRect().left +
      scroller.scrollLeft -
      EDGE_PX;
    return start + pixelsToSeconds(x, pixelsPerSecond);
  }

  function seekFromRuler(event: PointerEvent): void {
    onSeek(roundToFrameSeconds(secondsAtClientX(event.clientX)));
  }

  function handleRulerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    editor.pause();
    seekFromRuler(event);
  }

  function handleRulerMove(event: PointerEvent): void {
    if (event.buttons === 0) return;
    seekFromRuler(event);
  }

  let rowTap: { x: number; pointerId: number } | null = null;

  /** A tap on the beats row's empty space moves the playhead there. */
  function handleStepsDown(event: PointerEvent): void {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    rowTap = { x: event.clientX, pointerId: event.pointerId };
  }

  function handleStepsUp(event: PointerEvent): void {
    const tap = rowTap;
    rowTap = null;
    if (!tap || tap.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - tap.x) > 6) return;
    seekTo(roundToFrameSeconds(secondsAtClientX(event.clientX)));
  }

  function seekTo(seconds: number | null): void {
    if (seconds === null) return;
    editor.pause();
    onSeek(seconds);
  }

  function frameStep(frames: number): void {
    seekTo(playhead + frames * FRAME_SECONDS);
  }

  const previousStep = $derived(
    adjacentStepSeconds(steps, playhead, "previous")
  );
  const nextStep = $derived(adjacentStepSeconds(steps, playhead, "next"));

  // ---- Beats ---------------------------------------------------------------

  const labelled = $derived.by(() => {
    let gap = Infinity;
    for (let index = 1; index < steps.length; index++) {
      gap = Math.min(gap, steps[index]!.seconds - steps[index - 1]!.seconds);
    }
    return secondsToPixels(gap, pixelsPerSecond) >= STEP_LABEL_MIN_GAP_PX;
  });

  function onStep(step: ClipStep): boolean {
    return Math.abs(step.seconds - playhead) <= POST_KEYFRAME_MERGE_SECONDS;
  }

  // ---- Keyframes -----------------------------------------------------------

  interface KeyDrag {
    pointerId: number;
    startX: number;
    moved: boolean;
    from: number;
    to: number;
    targets: number[];
  }

  let drag = $state<KeyDrag | null>(null);
  let snapGuide = $state<number | null>(null);
  let suppressKeyClick = false;

  /** The clip as its row draws it: mid-drag, with the key moved. */
  const shownItem = $derived(
    drag?.moved ? moveKeyframe(item, "framing", drag.from, drag.to) : item
  );

  function handleKeyDown(event: PointerEvent, seconds: number): void {
    editor.pause();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      moved: false,
      from: seconds,
      to: seconds,
      targets: [...steps.map((step) => step.seconds), playhead],
    };
  }

  function handleWindowMove(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId || !laneShiftEl)
      return;
    if (!current.moved) {
      if (Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD_PX) return;
      current.moved = true;
    }
    const raw = pixelsToSeconds(
      event.clientX - laneShiftEl.getBoundingClientRect().left,
      pixelsPerSecond
    );
    const snapped = snapToTargets(raw, current.targets, pixelsPerSecond);
    const seconds =
      snapped.snappedToSeconds !== null
        ? snapped.seconds
        : roundToFrameSeconds(raw);
    current.to = Math.min(end, Math.max(start, seconds));
    snapGuide =
      snapped.snappedToSeconds !== null &&
      Math.abs(current.to - snapped.snappedToSeconds) < POST_TIME_EPSILON
        ? snapped.snappedToSeconds
        : null;
  }

  function handleWindowUp(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    drag = null;
    snapGuide = null;
    if (!current.moved) return;
    suppressKeyClick = true;
    if (Math.abs(current.to - current.from) > POST_TIME_EPSILON) {
      onMoveKey(current.from, current.to);
      void focusKey(current.to);
    }
  }

  function handleWindowCancel(event: PointerEvent): void {
    if (drag && event.pointerId === drag.pointerId) {
      drag = null;
      snapGuide = null;
    }
  }

  function handleKeyClick(seconds: number): void {
    if (suppressKeyClick) {
      suppressKeyClick = false;
      return;
    }
    seekTo(seconds);
  }

  function handleKeyKeydown(event: KeyboardEvent, seconds: number): void {
    if (locked) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDeleteKey(seconds);
      void focusKey(seconds);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const frames =
        (event.shiftKey ? 10 : 1) * (event.key === "ArrowLeft" ? -1 : 1);
      const next = Math.min(
        end,
        Math.max(start, seconds + frames * FRAME_SECONDS)
      );
      if (Math.abs(next - seconds) > POST_TIME_EPSILON) {
        onMoveKey(seconds, next);
        void focusKey(next);
      }
    }
  }

  /**
   * Keeps the keyboard on the key it just moved, or on the nearest one left
   * after a delete, so the next press does not fall through to the screen.
   */
  async function focusKey(seconds: number): Promise<void> {
    await tick();
    let nearest: HTMLElement | null = null;
    let distance = Infinity;
    for (const key of laneShiftEl?.querySelectorAll<HTMLElement>(".kf-key") ??
      []) {
      const gap = Math.abs(Number(key.dataset.seconds) - seconds);
      if (gap < distance) {
        distance = gap;
        nearest = key;
      }
    }
    (nearest ?? scrollEl)?.focus();
  }

  const clock = (seconds: number) => formatTakeClock(seconds - start);
  const now = $derived(clock(Math.min(end, Math.max(start, playhead))));
  const total = $derived(formatTakeClock(length));

  /** Goes to a typed time, counted from the clip's start. */
  function typeTime(seconds: number): void {
    seekTo(roundToFrameSeconds(start + seconds));
  }
</script>

<svelte:window
  onpointermove={handleWindowMove}
  onpointerup={handleWindowUp}
  onpointercancel={handleWindowCancel}
/>

<div class="crop-timeline" role="group" aria-label={t("post_crop_timebar")}>
  <div class="bar">
    <div class="transport">
      <button
        type="button"
        class="step-btn"
        disabled={previousStep === null}
        onclick={() => seekTo(previousStep)}
        aria-label={t("post_crop_beat_previous")}
        aria-keyshortcuts="ArrowUp"
        title={t("post_crop_beat_previous")}
      >
        <i class="fa-solid fa-backward-fast" aria-hidden="true"></i>
        <span class="step-word" aria-hidden="true">{t("post_crop_beat")}</span>
      </button>
      <button
        type="button"
        class="round"
        onclick={() => frameStep(-1)}
        disabled={playhead <= start + POST_TIME_EPSILON}
        aria-label={t("post_editor_frame_back")}
        aria-keyshortcuts="ArrowLeft"
        title={t("post_editor_frame_back")}
      >
        <i class="fa-solid fa-backward-step" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="round play"
        onclick={onToggle}
        aria-label={editor.isPlaying
          ? t("share_studio_deep_pause")
          : t("share_studio_deep_play")}
        aria-keyshortcuts="Space"
      >
        <i
          class="fa-solid {editor.isPlaying ? 'fa-pause' : 'fa-play'}"
          aria-hidden="true"
        ></i>
      </button>
      <button
        type="button"
        class="round"
        onclick={() => frameStep(1)}
        disabled={playhead >= lastFrame - POST_TIME_EPSILON}
        aria-label={t("post_editor_frame_forward")}
        aria-keyshortcuts="ArrowRight"
        title={t("post_editor_frame_forward")}
      >
        <i class="fa-solid fa-forward-step" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="step-btn"
        disabled={nextStep === null}
        onclick={() => seekTo(nextStep)}
        aria-label={t("post_crop_beat_next")}
        aria-keyshortcuts="ArrowDown"
        title={t("post_crop_beat_next")}
      >
        <span class="step-word" aria-hidden="true">{t("post_crop_beat")}</span>
        <i class="fa-solid fa-forward-fast" aria-hidden="true"></i>
      </button>
    </div>
    <div class="clock">
      <TypeableValue
        label={t("share_studio_deep_playhead")}
        text={now}
        draft={now}
        parse={parseClock}
        sizer={total}
        oncommit={typeTime}
      />
      <span class="total">/ {total}</span>
    </div>
    <div class="keys">{@render keys()}</div>
    <div class="zoom">
      <PostTimelineZoomControls
        onZoomOut={() => zoomBy(1 / ZOOM_STEP_FACTOR)}
        onZoomIn={() => zoomBy(ZOOM_STEP_FACTOR)}
        onFit={fit}
      />
    </div>
  </div>

  <div class="rows">
    <div class="heads">
      <span class="head ruler-head">
        <span class="head-clock">
          <TypeableValue
            label={t("share_studio_deep_playhead")}
            text={now}
            draft={now}
            parse={parseClock}
            sizer={total}
            oncommit={typeTime}
          />
        </span>
      </span>
      <span class="head" style:height="{STEPS_HEIGHT_PX}px" aria-hidden="true"
        >{t("post_editor_beats")}</span
      >
      <span class="head" style:height="{KEYS_HEIGHT_PX}px" aria-hidden="true"
        >{channelLabel("framing")}</span
      >
    </div>
    <!-- Focusable so the keyboard lands here, not on the page, when the key
         it was on is deleted. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="scroller"
      bind:this={scrollEl}
      bind:clientWidth={viewportWidthPx}
      tabindex="-1"
      onscroll={handleScroll}
      onwheel={handleWheel}
    >
      <div class="content" style:width="{trackWidthPx + 2 * EDGE_PX}px">
        <div
          class="row ruler"
          role="group"
          aria-label={t("post_timeline_ruler_label")}
          onpointerdown={handleRulerDown}
          onpointermove={handleRulerMove}
        >
          <div
            class="track"
            style:left="{EDGE_PX}px"
            style:width="{trackWidthPx}px"
          >
            <TimeRuler
              duration={length}
              {pixelsPerSecond}
              tickInterval={rulerTickInterval(pixelsPerSecond)}
            />
          </div>
        </div>

        <div
          class="row steps"
          class:dense={!labelled}
          style:height="{STEPS_HEIGHT_PX}px"
          role="group"
          aria-label={t("post_editor_beats")}
          onpointerdown={handleStepsDown}
          onpointerup={handleStepsUp}
          onpointercancel={() => (rowTap = null)}
        >
          {#if steps.length === 0}
            <span class="no-steps">{t("post_crop_no_beats")}</span>
          {/if}
          {#each steps as step (step.position)}
            <button
              type="button"
              class="step"
              class:pass={step.passStart}
              class:on={onStep(step)}
              style:left="{xOf(step.seconds)}px"
              aria-label={stepName(step)}
              aria-current={onStep(step) || undefined}
              title={stepName(step)}
              onclick={() => seekTo(step.seconds)}
            >
              {#if labelled || step.passStart || step.position === 0}
                <span class="count" aria-hidden="true">{step.label}</span>
              {/if}
              <span class="tick" aria-hidden="true"></span>
            </button>
          {/each}
        </div>

        <div class="row keys-row" style:height="{KEYS_HEIGHT_PX}px">
          {#each steps as step (step.position)}
            <span
              class="guide"
              style:left="{xOf(step.seconds)}px"
              aria-hidden="true"
            ></span>
          {/each}
          <div
            class="lane-shift"
            bind:this={laneShiftEl}
            style:left="{xOf(0)}px"
            style:width="{secondsToPixels(end, pixelsPerSecond)}px"
          >
            <PostTimelineKeyLane
              item={shownItem}
              channel="framing"
              heightPx={KEYS_HEIGHT_PX}
              {pixelsPerSecond}
              playheadSeconds={playhead}
              focused
              {locked}
              formatTime={clock}
              onSeek={(seconds) => seekTo(roundToFrameSeconds(seconds))}
              onKeyPointerDown={handleKeyDown}
              onKeyClick={handleKeyClick}
              onKeyKeydown={handleKeyKeydown}
              onCurveClick={onOpenCurve}
            />
          </div>
        </div>

        <div
          class="playhead"
          style:left="{playheadXPx}px"
          aria-hidden="true"
        ></div>
        {#if snapGuide !== null}
          <div
            class="snap-guide"
            style:left="{xOf(snapGuide)}px"
            aria-hidden="true"
          ></div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .crop-timeline {
    container: post-timeline-toolbar / inline-size;
    display: grid;
    gap: 0.375rem;
    min-width: 0;
  }

  /* Stepping and play, the clock, the keyframe buttons, zoom. It wraps onto
     a second line when narrow, the stepping always first. */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem 0.75rem;
    min-width: 0;
  }

  .transport {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .round,
  .step-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: var(--min-touch-target, 44px);
    flex: none;
    border: 1px solid var(--theme-stroke, #484755);
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .round {
    width: var(--min-touch-target, 44px);
    padding: 0;
    border-radius: 50%;
  }

  .play {
    width: 3.25rem;
    height: 3.25rem;
    border-color: var(--theme-accent, #d4813a);
  }

  .step-btn {
    padding-inline: 0.75rem;
    border-radius: 999px;
  }

  .round:disabled,
  .step-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .round:focus-visible,
  .step-btn:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .round:not(:disabled):hover,
    .step-btn:not(:disabled):hover {
      background: color-mix(
        in srgb,
        var(--theme-accent, #d4813a) 12%,
        var(--theme-card-bg)
      );
    }
  }

  .clock {
    --typeable-font-size: 0.9375rem;
    --typeable-min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .total {
    color: var(--theme-text-secondary, #aaa);
  }

  .keys {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .zoom {
    margin-inline-start: auto;
  }

  /* Over the row names, only while the bar has no room for the time. Its
     row stays either way, level with the ruler. */
  .head-clock {
    display: none;
    --typeable-font-size: var(--font-size-compact, 0.75rem);
    --typeable-min-width: 0;
  }

  /* The rows: names in a column on the left, the clip scrolling beside it. */
  .rows {
    --ruler-height: 28px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.5rem;
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-bg, #101018) 70%, #000);
  }

  .heads {
    display: grid;
    align-content: start;
    border-inline-end: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: var(--theme-panel-bg, rgba(10, 12, 18, 0.92));
  }

  .head {
    display: flex;
    align-items: center;
    padding-inline: 0.625rem;
    box-sizing: border-box;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-dim, #bbb);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    white-space: nowrap;
  }

  .ruler-head,
  .ruler {
    height: var(--ruler-height);
  }

  /* Narrow: the stepping on one line, the keyframe buttons and zoom on the
     next, and the time over the row names. The ruler's row grows to a
     finger's height there, so the time can be pressed to type one. */
  @container post-timeline-toolbar (max-width: 34rem) {
    .bar > .clock {
      display: none;
    }

    .rows {
      --ruler-height: calc(var(--min-touch-target, 44px) + 1px);
    }

    .head-clock {
      display: grid;
      width: 100%;
    }

    .ruler-head {
      padding-inline: 0.25rem;
    }
  }

  .scroller {
    position: relative;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    outline: none;
  }

  /* The clip, with a little room at each end. Anything drawn before the
     clip's start or past its end is cut off here. */
  .content {
    position: relative;
    min-width: 100%;
    overflow: hidden;
  }

  .row {
    position: relative;
    box-sizing: border-box;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .track {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  .ruler {
    cursor: ew-resize;
    touch-action: none;
    background: var(--theme-panel-elevated-bg);
  }

  /* Each label starts just after its tick, so the 0:00 label stays in view. */
  .ruler :global(.tick-label) {
    left: 4px;
    transform: none;
  }

  .no-steps {
    position: absolute;
    inset: 0 auto 0 0.625rem;
    display: flex;
    align-items: center;
    color: var(--theme-text-dim, #bbb);
    font-size: var(--font-size-compact, 0.75rem);
    white-space: nowrap;
    pointer-events: none;
  }

  /* A beat: its count over a tick, pressed to go to it. */
  .step {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 28px;
    margin: 0;
    padding: 3px 0 0;
    border: 0;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--theme-text-secondary, #aaa);
    font: inherit;
    transform: translateX(-50%);
    cursor: pointer;
  }

  .steps.dense .step {
    width: 14px;
  }

  .step .count {
    font-size: 0.6875rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .step .tick {
    width: 2px;
    height: 10px;
    margin-top: auto;
    border-radius: 1px;
    background: currentColor;
    opacity: 0.7;
  }

  .step.pass {
    color: var(--theme-text, #fff);
  }

  .step.pass .tick {
    height: 16px;
    opacity: 1;
  }

  .step.on {
    color: var(--theme-accent, #d4813a);
  }

  .step.on .tick {
    opacity: 1;
  }

  @media (hover: hover) {
    .step:hover {
      color: var(--theme-text, #fff);
      background: color-mix(in srgb, var(--theme-text, #fff) 8%, transparent);
    }
  }

  .step:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: -2px;
  }

  /* A beat's line through the keyframes, to line a key up with it. */
  .guide {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 1;
    width: 1px;
    background: var(--theme-text, #fff);
    opacity: 0.14;
    pointer-events: none;
  }

  .lane-shift {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 3;
    width: 2px;
    margin-left: -1px;
    background: var(--semantic-danger, #ff5d5d);
    pointer-events: none;
  }

  .snap-guide {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 4;
    width: 1px;
    background: var(--theme-accent);
    opacity: 0.8;
    pointer-events: none;
  }

  @media (forced-colors: active) {
    .playhead {
      background: Highlight;
    }

    .step.on {
      color: Highlight;
    }
  }
</style>
