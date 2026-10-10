<script lang="ts">
  import { flushSync, onDestroy, onMount, untrack } from "svelte";
  import type { LandingRef } from "./post-timing-session.svelte";
  import type {
    ResolvedTakeTiming,
    TakeTiming,
  } from "#lib/shared/media-composition/domain/take-timing.js";
  import { MIN_MOVE_SECONDS } from "#lib/shared/media-composition/domain/take-timing.js";
  import { landingName } from "#lib/shared/media-composition/domain/timing-summary.js";
  import TimeRuler from "#lib/shared/timeline/TimeRuler.svelte";
  import {
    POST_TIMELINE_MAX_PIXELS_PER_SECOND,
    revealPlayheadScrollLeft,
    rulerTickInterval,
    scrollLeftForStableAnchor,
  } from "../editor/timeline/post-timeline-geometry";
  import { formatTakeClock } from "./post-builder-format";
  import { shownLandings } from "./timing-lane-landings";

  interface Props {
    timing: TakeTiming;
    resolved: ResolvedTakeTiming | null;
    durationSeconds: number;
    mediaSeconds: number;
    movesPerPass: number;
    windowSeconds: number;
    selected: LandingRef | null;
    editable?: boolean;
    onGestureChange?: (cancel: (() => void) | null) => void;
    onseek: (seconds: number) => void;
    onselect: (landing: LandingRef | null) => void;
    onplace: (landing: LandingRef, seconds: number) => void;
    onzoom?: (windowSeconds: number) => void;
    dragRange: (landing: LandingRef) => { min: number; max: number } | null;
  }
  let {
    timing,
    resolved,
    durationSeconds,
    mediaSeconds,
    movesPerPass,
    windowSeconds,
    selected,
    editable = false,
    onGestureChange,
    onseek,
    onselect,
    onplace,
    onzoom,
    dragRange,
  }: Props = $props();
  let viewport = $state<HTMLDivElement | null>(null);
  let track = $state<HTMLDivElement | null>(null);
  let viewportWidth = $state(0);
  type Gesture = {
    pointerId: number;
    left: number;
    scale: number;
    startX: number;
    seconds: number;
    moved: boolean;
    landing: LandingRef | null;
    range: { min: number; max: number };
  };
  let gesture = $state<Gesture | null>(null);
  const span = $derived(
    Math.max(0.5, Math.min(windowSeconds, durationSeconds || windowSeconds))
  );
  const scale = $derived(Math.max(1, viewportWidth - 32) / span);
  const width = $derived(Math.max(viewportWidth, durationSeconds * scale + 32));
  const ZOOM_STEP_FACTOR = 1.25;
  const landings = $derived(
    shownLandings(timing, resolved).map((landing) => ({
      ...landing,
      passStart:
        landing.position > 0 && (landing.position - 1) % movesPerPass === 0,
      label:
        landing.position <= 0
          ? "S"
          : String(((landing.position - 1) % movesPerPass) + 1),
    }))
  );

  // Keep the scale fixed under the pointer. Seeking must never slide the
  // timeline away from the hand that is scrubbing it.
  $effect(() => {
    const seconds = mediaSeconds;
    const pixelsPerSecond = scale;
    if (!viewport || gesture) return;
    untrack(() => {
      if (!viewport) return;
      const next = revealPlayheadScrollLeft({
        playheadSeconds: seconds,
        pixelsPerSecond,
        scrollLeftPx: viewport.scrollLeft,
        viewportWidthPx: Math.max(1, viewportWidth - 32),
      });
      if (next !== null) viewport.scrollLeft = next;
    });
  });
  $effect(() => {
    if (!editable && gesture?.landing) cancelGesture();
  });

  function isSelected(ref: LandingRef): boolean {
    return (
      selected?.sectionId === ref.sectionId &&
      selected.position === ref.position
    );
  }

  function wheelZoom(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey) || !viewport || !onzoom || gesture)
      return;
    event.preventDefault();
    if (event.deltaY === 0) return;
    const minimumSpan = Math.min(
      span,
      Math.max(
        0.5,
        Math.max(1, viewportWidth - 32) / POST_TIMELINE_MAX_PIXELS_PER_SECOND
      )
    );
    const nextSpan = Math.min(
      Math.max(0.5, durationSeconds),
      Math.max(
        minimumSpan,
        span * (event.deltaY < 0 ? 1 / ZOOM_STEP_FACTOR : ZOOM_STEP_FACTOR)
      )
    );
    if (nextSpan === span) return;

    const cursorX = event.clientX - viewport.getBoundingClientRect().left;
    const anchorSeconds = Math.max(
      0,
      Math.min(durationSeconds, (viewport.scrollLeft + cursorX - 16) / scale)
    );
    onzoom(nextSpan);
    // Make the wider track scrollable before positioning it under the cursor.
    flushSync();
    viewport.scrollLeft = scrollLeftForStableAnchor({
      anchorSeconds,
      anchorClientXPx: cursorX - 16,
      newPixelsPerSecond: Math.max(1, viewportWidth - 32) / nextSpan,
    });
  }
  function begin(
    event: PointerEvent,
    landing: LandingRef | null = null,
    seconds = mediaSeconds
  ): void {
    if (event.button !== 0 || !event.isPrimary || !track || gesture) return;
    event.preventDefault();
    event.stopPropagation();
    const range = landing
      ? dragRange(landing)
      : { min: 0, max: durationSeconds };
    if (!range) return;
    track.setPointerCapture(event.pointerId);
    track.focus({ preventScroll: true });
    gesture = {
      pointerId: event.pointerId,
      left: track.getBoundingClientRect().left + 16,
      scale,
      startX: event.clientX,
      seconds,
      moved: false,
      landing,
      range,
    };
    if (landing) onGestureChange?.(cancelGesture);
    onselect(landing);
    if (landing) onseek(seconds);
    else move(event);
  }
  function move(event: PointerEvent): void {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const moved = gesture.moved || Math.abs(event.clientX - gesture.startX) > 4;
    const seconds = Math.min(
      gesture.range.max,
      Math.max(
        gesture.range.min,
        (event.clientX - gesture.left) / gesture.scale
      )
    );
    gesture = {
      ...gesture,
      moved,
      seconds: !gesture.landing || moved ? seconds : gesture.seconds,
    };
    if (!gesture.landing) onseek(gesture.seconds);
  }
  function cancelGesture(): void {
    const pointerId = gesture?.pointerId;
    gesture = null;
    onGestureChange?.(null);
    if (pointerId !== undefined && track?.hasPointerCapture(pointerId))
      track.releasePointerCapture(pointerId);
  }
  function finish(event: PointerEvent): void {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    move(event);
    const finished = gesture;
    cancelGesture();
    // Commit once on release so one undo restores the whole adjustment.
    if (finished.landing && finished.moved)
      onplace(finished.landing, finished.seconds);
  }
  function keydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    if (event.key === "Escape") {
      cancelGesture();
      onselect(null);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    onselect(null);
    onseek(
      Math.min(
        durationSeconds,
        Math.max(
          0,
          mediaSeconds +
            (event.key === "ArrowLeft" ? -1 : 1) *
              (event.shiftKey ? 1 : MIN_MOVE_SECONDS)
        )
      )
    );
  }
  function cancelOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") cancelGesture();
  }
  onMount(() => {
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => window.removeEventListener("keydown", cancelOnEscape, true);
  });
  onDestroy(cancelGesture);
</script>

<svelte:window onblur={cancelGesture} />

<div
  class="timing-lane"
  class:editing={editable}
  bind:this={viewport}
  bind:clientWidth={viewportWidth}
  onwheel={wheelZoom}
>
  <div
    class="track"
    bind:this={track}
    style:width="{width}px"
    role="application"
    aria-roledescription="timeline"
    aria-label="Landing timeline. Drag to scrub. Left and right arrows step one frame."
    tabindex="0"
    onpointerdown={(event) => begin(event)}
    onpointermove={move}
    onpointerup={finish}
    onpointercancel={cancelGesture}
    onlostpointercapture={cancelGesture}
    onkeydown={keydown}
    ondragstart={(event) => event.preventDefault()}
  >
    <div class="ruler" aria-hidden="true">
      <TimeRuler
        duration={durationSeconds}
        pixelsPerSecond={scale}
        tickInterval={rulerTickInterval(scale)}
      />
    </div>
    {#each timing.sections as section, index (section.id)}
      {#if index > 0}<span
          class="section-edge"
          style:left="{16 + section.startSeconds * scale}px"
          aria-hidden="true"
        ></span>{/if}
    {/each}
    {#each landings as landing (`${landing.sectionId}:${landing.position}`)}
      {@const dragging =
        gesture?.landing?.sectionId === landing.sectionId &&
        gesture?.landing?.position === landing.position}
      {@const seconds = dragging && gesture ? gesture.seconds : landing.seconds}
      {#if editable}
        <button
          type="button"
          class="landing"
          class:pass-start={landing.passStart}
          class:pinned={landing.pinned}
          class:selected={isSelected(landing)}
          class:dragging
          style:left="{16 + seconds * scale}px"
          aria-label="{landingName(
            landing.position,
            movesPerPass
          )} at {formatTakeClock(seconds)}"
          aria-pressed={isSelected(landing)}
          onpointerdown={(event) =>
            begin(
              event,
              { sectionId: landing.sectionId, position: landing.position },
              landing.seconds
            )}
          onclick={(event) => {
            if (event.detail === 0) {
              onselect(landing);
              onseek(landing.seconds);
            }
          }}
        >
          <span class="number">{landing.label}</span><span
            class="stem"
            aria-hidden="true"
          ></span>
        </button>
      {:else}
        <span
          class="landing locked"
          class:pass-start={landing.passStart}
          class:pinned={landing.pinned}
          style:left="{16 + landing.seconds * scale}px"
          aria-hidden="true"
        >
          <span class="number">{landing.label}</span><span class="stem"></span>
        </span>
      {/if}
    {/each}
    <span
      class="playhead"
      style:left="{16 + mediaSeconds * scale}px"
      aria-hidden="true"
    ></span>
  </div>
</div>

<style>
  .timing-lane {
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    background: var(--theme-card-bg);
    user-select: none;
    -webkit-user-select: none;
    scrollbar-width: thin;
  }
  .timing-lane.editing {
    border-color: var(--theme-primary, #d4813a);
  }
  .track {
    position: relative;
    height: 6rem;
    touch-action: none;
    cursor: crosshair;
    outline-offset: -3px;
  }
  .track:focus-visible,
  .landing:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
  }
  .ruler {
    position: absolute;
    top: 0;
    right: 16px;
    left: 16px;
    height: 1.75rem;
    pointer-events: none;
  }
  .section-edge {
    position: absolute;
    top: 2rem;
    bottom: 0;
    border-left: 1px dashed var(--theme-text-secondary, #aaa);
    pointer-events: none;
  }
  .landing {
    position: absolute;
    top: 2rem;
    bottom: 0.4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    width: 2rem;
    margin-left: -1rem;
    padding: 0;
    border: 0;
    color: var(--theme-text-secondary, #aaa);
    background: none;
    font: inherit;
    cursor: ew-resize;
    touch-action: none;
  }
  .locked {
    pointer-events: none;
  }
  .number {
    font-size: 0.875rem;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }
  .stem {
    width: 2px;
    height: 1.1rem;
    background: currentColor;
  }
  .pass-start {
    color: var(--theme-text, #fff);
  }
  .pass-start .stem {
    height: 1.6rem;
  }
  .pass-start .number {
    font-weight: 700;
  }
  .pinned .stem {
    width: 4px;
    border-radius: 2px;
  }
  .selected,
  .dragging {
    color: var(--theme-primary, #d4813a);
    background: color-mix(
      in srgb,
      var(--theme-primary, #d4813a) 15%,
      transparent
    );
    border-radius: 0.25rem;
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--theme-text, #fff);
    pointer-events: none;
  }
  .playhead::before {
    content: "";
    position: absolute;
    top: 0;
    left: -4px;
    width: 10px;
    height: 8px;
    background: inherit;
    clip-path: polygon(0 0, 100% 0, 100% 50%, 50% 100%, 0 50%);
  }
</style>
