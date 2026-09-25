<script lang="ts">
  import type { LandingRef } from "./post-timing-session.svelte";
  import type {
    ResolvedTakeTiming,
    TakeTiming,
  } from "$lib/shared/media-composition/domain/take-timing";
  import { MIN_MOVE_SECONDS } from "$lib/shared/media-composition/domain/take-timing";
  import { landingName } from "$lib/shared/media-composition/domain/timing-summary";
  import { formatTakeClock } from "./post-builder-format";

  /**
   * The take's timing drawn against its own clock: a close-up window that
   * follows the playhead, with every landing numbered, the taps under it and
   * pass starts standing taller; and a strip of the whole take to jump
   * around in. A landing can be dragged, or focused and nudged a frame at a
   * time with the arrow keys.
   */
  interface Props {
    timing: TakeTiming;
    resolved: ResolvedTakeTiming | null;
    durationSeconds: number;
    mediaSeconds: number;
    movesPerPass: number;
    windowSeconds: number;
    selected: LandingRef | null;
    onseek: (seconds: number) => void;
    onselect: (landing: LandingRef) => void;
    onplace: (landing: LandingRef, seconds: number) => void;
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
    onseek,
    onselect,
    onplace,
    dragRange,
  }: Props = $props();

  let detail = $state<HTMLDivElement | null>(null);
  let overview = $state<HTMLDivElement | null>(null);
  let drag = $state<{
    landing: LandingRef;
    seconds: number;
    startX: number;
    moved: boolean;
    range: { min: number; max: number };
  } | null>(null);

  const span = $derived(
    Math.max(0.5, Math.min(windowSeconds, durationSeconds || windowSeconds))
  );
  const windowStart = $derived(
    Math.min(
      Math.max(0, durationSeconds - span),
      Math.max(0, mediaSeconds - span / 2)
    )
  );
  const windowEnd = $derived(windowStart + span);

  function at(seconds: number): string {
    return `${((seconds - windowStart) / span) * 100}%`;
  }
  function overall(seconds: number): string {
    return durationSeconds > 0 ? `${(seconds / durationSeconds) * 100}%` : "0%";
  }
  function inWindow(seconds: number): boolean {
    return seconds >= windowStart - 0.05 && seconds <= windowEnd + 0.05;
  }

  const landings = $derived(
    (resolved?.sections ?? []).flatMap((section) =>
      section.landings.map((landing) => ({
        ...landing,
        sectionId: section.id,
        passStart:
          landing.position > 0 && (landing.position - 1) % movesPerPass === 0,
        isEnd: section.endPosition === landing.position,
        label:
          landing.position <= 0
            ? "S"
            : String(((landing.position - 1) % movesPerPass) + 1),
      }))
    )
  );

  const taps = $derived(
    (resolved?.sections ?? []).flatMap((section) =>
      (section.fit?.labels ?? []).map((label) => ({
        seconds: label.seconds,
        matched: label.position !== null,
      }))
    )
  );

  function isSelected(sectionId: string, position: number): boolean {
    return selected?.sectionId === sectionId && selected.position === position;
  }

  function secondsFromX(element: HTMLElement, clientX: number): number {
    const rect = element.getBoundingClientRect();
    const share = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return windowStart + Math.min(1, Math.max(0, share)) * span;
  }

  function seekFromDetail(event: PointerEvent): void {
    if (!detail || event.target !== event.currentTarget) return;
    onseek(secondsFromX(detail, event.clientX));
  }

  function seekFromOverview(event: PointerEvent): void {
    if (!overview) return;
    if (event.type === "pointerdown") {
      overview.setPointerCapture(event.pointerId);
    } else if (!overview.hasPointerCapture(event.pointerId)) {
      return;
    }
    const rect = overview.getBoundingClientRect();
    const share = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    onseek(Math.min(1, Math.max(0, share)) * durationSeconds);
  }

  function startDrag(
    event: PointerEvent,
    landing: LandingRef,
    seconds: number
  ) {
    const range = dragRange(landing);
    if (!range || event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = { landing, seconds, startX: event.clientX, moved: false, range };
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag || !detail) return;
    const moved = drag.moved || Math.abs(event.clientX - drag.startX) > 3;
    const seconds = Math.min(
      drag.range.max,
      Math.max(drag.range.min, secondsFromX(detail, event.clientX))
    );
    drag = { ...drag, moved, seconds: moved ? seconds : drag.seconds };
  }

  function endDrag(landing: LandingRef, seconds: number): void {
    const finished = drag;
    drag = null;
    if (finished?.moved) {
      onplace(finished.landing, finished.seconds);
    } else {
      onselect(landing);
      onseek(seconds);
    }
  }

  function nudge(event: KeyboardEvent, landing: LandingRef, seconds: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.1 : MIN_MOVE_SECONDS;
    onselect(landing);
    onplace(landing, seconds + (event.key === "ArrowLeft" ? -step : step));
  }
</script>

<div class="timing-lane">
  <div
    class="detail"
    bind:this={detail}
    onpointerdown={seekFromDetail}
    role="group"
    aria-label="Landings near the playhead"
  >
    {#each timing.sections as section, index (section.id)}
      {#if index > 0 && inWindow(section.startSeconds)}
        <span class="section-edge" style:left={at(section.startSeconds)}>
          <span>Part {index + 1}</span>
        </span>
      {/if}
    {/each}

    {#each taps as tap, index (index)}
      {#if inWindow(tap.seconds)}
        <span
          class="tap"
          class:unmatched={!tap.matched}
          style:left={at(tap.seconds)}
          aria-hidden="true"
        ></span>
      {/if}
    {/each}

    {#each landings as landing (`${landing.sectionId}:${landing.position}`)}
      {@const ref = {
        sectionId: landing.sectionId,
        position: landing.position,
      }}
      {@const dragging =
        drag?.landing.sectionId === landing.sectionId &&
        drag.landing.position === landing.position}
      {@const seconds = dragging && drag ? drag.seconds : landing.seconds}
      {#if inWindow(seconds)}
        <button
          type="button"
          class="landing"
          class:pass-start={landing.passStart}
          class:pinned={landing.pinned}
          class:end={landing.isEnd}
          class:selected={isSelected(landing.sectionId, landing.position)}
          class:dragging
          style:left={at(seconds)}
          aria-label="{landingName(
            landing.position,
            movesPerPass
          )} at {formatTakeClock(seconds)}{landing.pinned
            ? ', placed by hand'
            : ''}{landing.isEnd ? ', performance ends' : ''}"
          aria-pressed={isSelected(landing.sectionId, landing.position)}
          onpointerdown={(event) => startDrag(event, ref, landing.seconds)}
          onpointermove={moveDrag}
          onpointerup={() => endDrag(ref, landing.seconds)}
          onpointercancel={() => (drag = null)}
          onkeydown={(event) => nudge(event, ref, landing.seconds)}
          onclick={(event) => {
            // Pointer clicks are handled on release; this is the keyboard path.
            if (event.detail === 0) {
              onselect(ref);
              onseek(landing.seconds);
            }
          }}
        >
          <span class="stem" aria-hidden="true"></span>
          <span class="number">{landing.label}</span>
        </button>
      {/if}
    {/each}

    <span class="playhead" style:left={at(mediaSeconds)} aria-hidden="true"
    ></span>
  </div>

  <div
    class="overview"
    bind:this={overview}
    onpointerdown={seekFromOverview}
    onpointermove={seekFromOverview}
    role="slider"
    tabindex="0"
    aria-label="Whole take"
    aria-valuemin={0}
    aria-valuemax={Math.round(durationSeconds * 100) / 100}
    aria-valuenow={Math.round(mediaSeconds * 100) / 100}
    aria-valuetext={formatTakeClock(mediaSeconds)}
    onkeydown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        onseek(mediaSeconds + (event.key === "ArrowLeft" ? -step : step));
      }
    }}
  >
    {#each timing.sections as section, index (section.id)}
      <span
        class="band"
        class:alt={index % 2 === 1}
        style:left={overall(section.startSeconds)}
        style:width={overall(section.endSeconds - section.startSeconds)}
        aria-hidden="true"
      ></span>
    {/each}
    {#each landings as landing (`o:${landing.sectionId}:${landing.position}`)}
      <span
        class="mini"
        class:pass-start={landing.passStart}
        style:left={overall(landing.seconds)}
        aria-hidden="true"
      ></span>
    {/each}
    <span
      class="window"
      style:left={overall(windowStart)}
      style:width={overall(span)}
      aria-hidden="true"
    ></span>
    <span class="playhead" style:left={overall(mediaSeconds)} aria-hidden="true"
    ></span>
  </div>
</div>

<style>
  .timing-lane {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    user-select: none;
  }
  .detail {
    position: relative;
    height: 4.5rem;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    background: var(--theme-card-bg);
    touch-action: none;
    cursor: pointer;
  }
  .overview {
    position: relative;
    height: 1.75rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.375rem;
    background: var(--theme-card-bg);
    touch-action: none;
    cursor: pointer;
  }
  .overview:focus-visible,
  .landing:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 2px;
  }
  .section-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 2px dashed var(--theme-text-secondary, #aaa);
    pointer-events: none;
  }
  .section-edge span {
    position: absolute;
    top: 0.25rem;
    left: 0.25rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .tap {
    position: absolute;
    bottom: 0.35rem;
    width: 0.5rem;
    height: 0.5rem;
    margin-left: -0.25rem;
    border-radius: 50%;
    background: var(--theme-primary, #d4813a);
    pointer-events: none;
  }
  .tap.unmatched {
    border: 1.5px solid var(--theme-text-secondary, #aaa);
    background: transparent;
  }
  .landing {
    position: absolute;
    top: 0;
    bottom: 1.1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    width: 1.75rem;
    margin-left: -0.875rem;
    padding: 0;
    border: 0;
    color: var(--theme-text-secondary, #aaa);
    background: none;
    font: inherit;
    cursor: ew-resize;
    touch-action: none;
  }
  .stem {
    width: 2px;
    height: 1.25rem;
    background: currentColor;
  }
  .landing.pass-start .stem {
    height: 2rem;
  }
  .landing.pass-start {
    color: var(--theme-text, #fff);
  }
  .number {
    order: -1;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .landing.pass-start .number {
    font-weight: 700;
  }
  .landing.pinned .stem {
    width: 4px;
    border-radius: 2px;
  }
  .landing.end .number::after {
    content: " end";
  }
  .landing.selected,
  .landing.dragging {
    color: var(--theme-primary, #d4813a);
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
  .band {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(
      in srgb,
      var(--theme-primary, #d4813a) 10%,
      transparent
    );
    pointer-events: none;
  }
  .band.alt {
    background: color-mix(
      in srgb,
      var(--theme-primary, #d4813a) 22%,
      transparent
    );
  }
  .mini {
    position: absolute;
    bottom: 0;
    width: 1px;
    height: 35%;
    background: var(--theme-text-secondary, #aaa);
    pointer-events: none;
  }
  .mini.pass-start {
    height: 70%;
    background: var(--theme-text, #fff);
  }
  .window {
    position: absolute;
    top: -1px;
    bottom: -1px;
    border: 1.5px solid var(--theme-text, #fff);
    border-radius: 0.25rem;
    pointer-events: none;
  }
</style>
