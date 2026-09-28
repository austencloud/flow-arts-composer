<script lang="ts">
  import {
    POST_KEYFRAME_MERGE_SECONDS,
    itemEnd,
    type PostEasing,
    type PostItem,
    type PostKeyframeChannel,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    channelKeyframeSeconds,
    channelSegments,
    channelValueAt,
    easingPresetOf,
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { formatPostClock } from "../../builder/post-builder-format";
  import {
    channelLabel,
    channelValueMeasure,
    channelValueText,
    easingPresetLabel,
  } from "../post-editor-labels";
  import { secondsToPixels } from "./post-timeline-geometry";

  /**
   * One keyframe row under the selected clip: that channel's keys as large
   * diamonds, and the curve between each pair drawn as its easing shape.
   * Like PostTimelineItem it only reports what was pressed; the timeline does
   * the drag math and the workspace makes the edit.
   */
  interface Props {
    item: PostItem;
    channel: PostKeyframeChannel;
    heightPx: number;
    pixelsPerSecond: number;
    playheadSeconds: number;
    focused: boolean;
    locked: boolean;
    onSeek: (seconds: number) => void;
    onKeyPointerDown: (event: PointerEvent, seconds: number) => void;
    onKeyClick: (seconds: number) => void;
    onKeyKeydown: (event: KeyboardEvent, seconds: number) => void;
    onCurveClick: (fromSeconds: number) => void;
  }

  let {
    item,
    channel,
    heightPx,
    pixelsPerSecond,
    playheadSeconds,
    focused,
    locked,
    onSeek,
    onKeyPointerDown,
    onKeyClick,
    onKeyKeydown,
    onCurveClick,
  }: Props = $props();

  /** A curve this wide has room for its from and to values. */
  const VALUES_MIN_WIDTH_PX = 112;
  /** How far a press may travel and still count as a tap on the empty row. */
  const TAP_SLOP_PX = 6;
  /**
   * Half a highlighted diamond. A key at the very start or end of the
   * timeline draws this far inside it rather than half cut off.
   */
  const KEY_EDGE_INSET_PX = 12;

  const name = $derived(channelLabel(channel));
  const keys = $derived(channelKeyframeSeconds(item, channel));
  const spanLeftPx = $derived(secondsToPixels(item.start, pixelsPerSecond));
  const spanWidthPx = $derived(secondsToPixels(item.duration, pixelsPerSecond));

  const curves = $derived.by(() => {
    const end = itemEnd(item);
    return channelSegments(item, channel).flatMap((segment) => {
      const from = Math.max(segment.fromSeconds, item.start);
      const to = Math.min(segment.toSeconds, end);
      if (to <= from) return [];
      const fullLeftPx = secondsToPixels(segment.fromSeconds, pixelsPerSecond);
      const leftPx = secondsToPixels(from, pixelsPerSecond);
      const widthPx = secondsToPixels(to, pixelsPerSecond) - leftPx;
      const fromValue = channelValueAt(item, channel, segment.fromSeconds);
      const toValue = channelValueAt(item, channel, segment.toSeconds);
      const fromText = channelValueText(channel, fromValue);
      const toText = channelValueText(channel, toValue);
      const preset = easingPresetOf(segment.easing);
      const curveName = preset === "custom" ? t("post_curve_custom") : easingPresetLabel(preset);
      return [
        {
          index: segment.index,
          fromSeconds: segment.fromSeconds,
          leftPx,
          widthPx,
          // The curve is drawn across the whole segment and clipped to what
          // shows, so a trimmed clip still shows the right part of its shape.
          shapeOffsetPx: fullLeftPx - leftPx,
          shapeWidthPx: secondsToPixels(segment.toSeconds - segment.fromSeconds, pixelsPerSecond),
          path: curvePath(
            segment.easing,
            curveDirection(
              channelValueMeasure(channel, fromValue),
              channelValueMeasure(channel, toValue)
            )
          ),
          values:
            fromText === null || toText === null || widthPx < VALUES_MIN_WIDTH_PX
              ? null
              : fromText === toText
                ? fromText
                : `${fromText} → ${toText}`,
          label: t("post_timeline_channel_curve", {
            channel: name,
            start: formatPostClock(segment.fromSeconds),
            end: formatPostClock(segment.toSeconds),
            curve: curveName,
          }),
        },
      ];
    });
  });

  type CurveDirection = "up" | "down" | "flat";

  /** Which way the value goes; Position has no single number, so it reads as up. */
  function curveDirection(from: number | null, to: number | null): CurveDirection {
    if (from === null || to === null) return "up";
    if (Math.abs(to - from) < 1e-6) return "flat";
    return to > from ? "up" : "down";
  }

  /** The easing drawn from the first key to the second, the way the value goes. */
  function curvePath(easing: PostEasing, direction: CurveDirection): string {
    if (direction === "flat") return "M0 50 H100";
    // SVG y grows downward: a rising value runs from the bottom to the top.
    const y = (progress: number) => (direction === "up" ? 100 - progress * 100 : progress * 100);
    if (easing === "hold") return `M0 ${y(0)} H100 V${y(1)}`;
    const [x1, y1, x2, y2] = easing;
    return `M0 ${y(0)} C${x1 * 100} ${y(y1)} ${x2 * 100} ${y(y2)} 100 ${y(1)}`;
  }

  let tapStart: { x: number; y: number; pointerId: number } | null = null;

  // A tap on the empty row moves the playhead there. A swipe that scrolls the
  // timeline is not a tap: the browser cancels the pointer, or it travels.
  function handleRowPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    tapStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }

  function handleRowPointerUp(event: PointerEvent): void {
    const start = tapStart;
    tapStart = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    onSeek(Math.max(0, (event.clientX - rect.left) / pixelsPerSecond));
  }

  function handleKeyPointerDown(event: PointerEvent, seconds: number): void {
    event.stopPropagation();
    if (locked) return;
    event.preventDefault();
    onKeyPointerDown(event, seconds);
  }
</script>

<div
  class="key-lane"
  class:focused
  style="height: {heightPx}px"
  role="group"
  aria-label={t("post_timeline_channel_lane", { channel: name })}
  onpointerdown={handleRowPointerDown}
  onpointerup={handleRowPointerUp}
  onpointercancel={() => (tapStart = null)}
>
  <div
    class="lane-span"
    style="left: {spanLeftPx}px; width: {spanWidthPx}px"
    aria-hidden="true"
  ></div>

  {#each curves as curve (curve.index)}
    <button
      type="button"
      class="curve"
      style="left: {curve.leftPx}px; width: {curve.widthPx}px"
      aria-label={curve.label}
      disabled={locked}
      onclick={() => onCurveClick(curve.fromSeconds)}
    >
      <svg
        class="curve-shape"
        style="left: {curve.shapeOffsetPx}px; width: {curve.shapeWidthPx}px"
        viewBox="0 -20 100 140"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={curve.path} />
      </svg>
      {#if curve.values}
        <span class="curve-values" aria-hidden="true">{curve.values}</span>
      {/if}
    </button>
  {/each}

  <!-- Keyed by place, not time: retiming a keyframe keeps its button, and
       with it the keyboard focus and the click that ends a drag. -->
  {#each keys as seconds, index (index)}
    <button
      type="button"
      class="kf-key"
      class:on={Math.abs(seconds - playheadSeconds) <= POST_KEYFRAME_MERGE_SECONDS}
      style="left: clamp({KEY_EDGE_INSET_PX}px, {secondsToPixels(
        seconds,
        pixelsPerSecond
      )}px, calc(100% - {KEY_EDGE_INSET_PX}px))"
      data-item-id={item.id}
      data-channel={channel}
      data-seconds={seconds}
      aria-label={t("post_timeline_channel_keyframe_at", {
        channel: name,
        time: formatPostClock(seconds),
      })}
      onpointerdown={(event) => handleKeyPointerDown(event, seconds)}
      onclick={(event) => {
        event.stopPropagation();
        onKeyClick(seconds);
      }}
      onkeydown={(event) => {
        event.stopPropagation();
        onKeyKeydown(event, seconds);
      }}
    >
      <span class="kf-key-glyph" aria-hidden="true"></span>
    </button>
  {/each}
</div>

<style>
  .key-lane {
    position: relative;
    box-sizing: border-box;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: color-mix(in srgb, var(--theme-bg, #101018) 70%, #000);
  }

  .lane-span {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--theme-accent) 6%, transparent);
    border-inline: 1px dashed color-mix(in srgb, var(--theme-accent) 30%, transparent);
    pointer-events: none;
  }

  .key-lane.focused .lane-span {
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }

  /* The curve between two keys: a tap opens its easing. It sits under the
     keys, whose wide hit areas win where they overlap. */
  .curve {
    position: absolute;
    top: 7px;
    bottom: 7px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    color: color-mix(in srgb, var(--theme-accent) 70%, var(--theme-text, #fff));
    cursor: pointer;
    font: inherit;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .key-lane.focused .curve {
    border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  }

  @media (hover: hover) {
    .curve:not(:disabled):hover {
      border-color: var(--theme-accent);
      background: color-mix(in srgb, var(--theme-accent) 26%, transparent);
    }
  }

  .curve:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 1px;
  }

  .curve:disabled {
    cursor: default;
  }

  .curve-shape {
    position: absolute;
    top: 4px;
    bottom: 4px;
    height: calc(100% - 8px);
    overflow: visible;
    pointer-events: none;
  }

  .curve-shape path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
    opacity: 0.9;
  }

  .curve-values {
    position: relative;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-bg, #101018) 80%, transparent);
    color: var(--theme-text, #fff);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
  }

  /* A key: a diamond centered on its time, with a 44px-wide hit area so it
     stays easy to grab on touch. Near-white with a dark outline reads on
     every tint. The focused row's keys take the accent. */
  .kf-key {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    padding: 0;
    transform: translateX(-50%);
    border: 0;
    background: transparent;
    cursor: grab;
    touch-action: none;
  }

  .kf-key-glyph {
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 2px solid var(--theme-bg, #101018);
    border-radius: 3px;
    background: var(--theme-text, #fff);
    transform: rotate(45deg);
    transition:
      background-color var(--transition-fast),
      transform var(--transition-fast);
  }

  .key-lane.focused .kf-key-glyph {
    background: var(--theme-accent, #d4813a);
  }

  /* The playhead sits on this key, so an edit now changes it. */
  .kf-key.on .kf-key-glyph {
    box-shadow: 0 0 0 2px var(--theme-text, #fff);
    transform: rotate(45deg) scale(1.2);
  }

  @media (hover: hover) {
    .kf-key:hover .kf-key-glyph {
      background: var(--theme-accent, #d4813a);
      transform: rotate(45deg) scale(1.2);
    }
  }

  .kf-key:focus-visible .kf-key-glyph {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .curve,
    .kf-key-glyph {
      transition: none;
    }
  }
</style>
