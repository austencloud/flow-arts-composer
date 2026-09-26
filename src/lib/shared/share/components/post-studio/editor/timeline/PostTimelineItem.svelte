<script lang="ts">
  import type { PostItem, PostItemKind } from "$lib/shared/media-composition/domain/post-project";
  import type { PostKeyframeMarker } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import { formatPostClock } from "../../builder/post-builder-format";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  /**
   * One clip block on the timeline. Purely presentational: the parent does
   * all the drag/trim math and hands this component plain pixel positions,
   * so the same block markup works for the main track and every overlay
   * track without knowing about zoom or scroll.
   */
  interface Props {
    item: PostItem;
    leftPx: number;
    widthPx: number;
    labelText: string;
    selected: boolean;
    locked: boolean;
    dimmed: boolean;
    onActivate: (itemId: string) => void;
    onBodyPointerDown: (event: PointerEvent) => void;
    onHandlePointerDown: (event: PointerEvent, edge: "start" | "end") => void;
    markers: PostKeyframeMarker[];
    onMarkerSeek: (seconds: number) => void;
    onMarkerPointerDown: (event: PointerEvent, seconds: number) => void;
    onMarkerKeydown: (event: KeyboardEvent, seconds: number) => void;
  }

  let {
    item,
    leftPx,
    widthPx,
    labelText,
    selected,
    locked,
    dimmed,
    onActivate,
    onBodyPointerDown,
    onHandlePointerDown,
    markers,
    onMarkerSeek,
    onMarkerPointerDown,
    onMarkerKeydown,
  }: Props = $props();

  const KIND_ICON: Record<PostItemKind, string> = {
    video: "fa-solid fa-film",
    card: "fa-solid fa-id-card",
    animation: "fa-solid fa-wand-magic-sparkles",
    moves: "fa-solid fa-arrows-up-down-left-right",
    carousel: "fa-solid fa-images",
    text: "fa-solid fa-font",
  };

  const speedLabel = $derived(
    item.kind === "video" && item.speed !== 1 ? `${item.speed}×` : null
  );
  const isMuted = $derived(item.kind === "video" && item.volume === 0);
  const pxPerSecond = $derived(item.duration > 0 ? widthPx / item.duration : 0);
  const hasKeyframes = $derived(markers.length > 0);

  const accessibleName = $derived.by(() => {
    const parts = [
      labelText,
      t("post_timeline_item_time_range", {
        start: formatPostClock(item.start),
        end: formatPostClock(item.start + item.duration),
      }),
    ];
    if (speedLabel) parts.push(t("post_timeline_item_speed", { speed: speedLabel }));
    if (isMuted) parts.push(t("post_timeline_item_muted"));
    if (item.fill) parts.push(t("post_timeline_item_linked"));
    if (hasKeyframes) parts.push(t("post_timeline_item_animated"));
    return parts.join(", ");
  });

  function handleBodyPointerDown(event: PointerEvent): void {
    // The row underneath deselects on its own pointerdown; without this the
    // press that starts a drag - or, on a locked item, the press that just
    // selects it - would also immediately clear the selection. Locked items
    // can still be selected, so this must run before the locked check.
    event.stopPropagation();
    if (locked) return;
    onBodyPointerDown(event);
  }

  function handleHandlePointerDown(
    event: PointerEvent,
    edge: "start" | "end"
  ): void {
    event.preventDefault();
    event.stopPropagation();
    onHandlePointerDown(event, edge);
  }

  function handleMarkerPointerDown(event: PointerEvent, seconds: number): void {
    event.preventDefault();
    event.stopPropagation();
    if (locked) return;
    onMarkerPointerDown(event, seconds);
  }

  function handleMarkerClick(event: MouseEvent, seconds: number): void {
    event.stopPropagation();
    onMarkerSeek(seconds);
  }

  function handleMarkerKeydown(event: KeyboardEvent, seconds: number): void {
    event.stopPropagation();
    onMarkerKeydown(event, seconds);
  }
</script>

<button
  type="button"
  class="post-timeline-item kind-{item.kind}"
  class:selected
  class:dimmed
  style="left: {leftPx}px; width: {Math.max(widthPx, 2)}px"
  aria-pressed={selected}
  aria-label={accessibleName}
  onpointerdown={handleBodyPointerDown}
  onclick={() => onActivate(item.id)}
>
  <i class={KIND_ICON[item.kind]} aria-hidden="true"></i>
  <span class="item-label">{labelText}</span>
  {#if speedLabel}
    <span class="item-badge">{speedLabel}</span>
  {/if}
  {#if isMuted}
    <i class="fa-solid fa-volume-xmark item-glyph" aria-hidden="true"></i>
  {/if}
  {#if item.fill}
    <i class="fa-solid fa-link item-glyph" aria-hidden="true"></i>
  {/if}
  {#if !selected && hasKeyframes}
    <i class="fa-solid fa-diamond item-glyph" aria-hidden="true"></i>
  {/if}
  {#if locked}
    <i class="fa-solid fa-lock item-glyph" aria-hidden="true"></i>
  {/if}
</button>

{#if selected && !locked}
  <button
    type="button"
    class="trim-handle trim-start"
    style="left: {leftPx}px"
    aria-label={t("post_timeline_trim_start", { label: labelText })}
    onpointerdown={(event) => handleHandlePointerDown(event, "start")}
  >
    <span class="handle-grip" aria-hidden="true"></span>
  </button>
  <button
    type="button"
    class="trim-handle trim-end"
    style="left: {leftPx + widthPx}px"
    aria-label={t("post_timeline_trim_end", { label: labelText })}
    onpointerdown={(event) => handleHandlePointerDown(event, "end")}
  >
    <span class="handle-grip" aria-hidden="true"></span>
  </button>
  {#each markers as marker (marker.seconds)}
    <button
      type="button"
      class="kf-marker"
      style="left: {leftPx + (marker.seconds - item.start) * pxPerSecond}px"
      aria-label={t("post_timeline_keyframe_at", { time: formatPostClock(marker.seconds) })}
      onpointerdown={(event) => handleMarkerPointerDown(event, marker.seconds)}
      onclick={(event) => handleMarkerClick(event, marker.seconds)}
      onkeydown={(event) => handleMarkerKeydown(event, marker.seconds)}
    >
      <i class="fa-solid fa-diamond kf-marker-glyph" aria-hidden="true"></i>
    </button>
  {/each}
{/if}

<style>
  .post-timeline-item {
    position: absolute;
    top: 3px;
    bottom: 3px;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    padding: 0 0.5rem;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--kind-tint, var(--theme-accent)) 22%, var(--theme-card-bg, #1c1c26));
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-compact, 0.75rem);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .post-timeline-item.kind-video {
    --kind-tint: var(--theme-accent);
  }
  .post-timeline-item.kind-card {
    --kind-tint: var(--semantic-info, #4f9dff);
  }
  .post-timeline-item.kind-animation {
    --kind-tint: var(--semantic-warning, #f6c85f);
  }
  .post-timeline-item.kind-moves {
    --kind-tint: #b98af8;
  }
  .post-timeline-item.kind-carousel {
    --kind-tint: #4fd1c5;
  }
  .post-timeline-item.kind-text {
    --kind-tint: #f28b82;
  }

  .post-timeline-item i:not(.item-glyph) {
    flex-shrink: 0;
    font-size: 0.85em;
    opacity: 0.85;
  }

  .item-label {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-badge {
    flex-shrink: 0;
    padding: 0.05rem 0.3rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--kind-tint, var(--theme-accent)) 45%, transparent);
    font-size: 0.7em;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .item-glyph {
    flex-shrink: 0;
    font-size: 0.75em;
    opacity: 0.8;
  }

  @media (hover: hover) {
    .post-timeline-item:hover {
      border-color: color-mix(in srgb, var(--kind-tint, var(--theme-accent)) 60%, var(--theme-stroke));
    }
  }

  .post-timeline-item:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* A swipe across the timeline scrolls it. Once an item is selected, a
     drag on it moves it instead. */
  .post-timeline-item.selected {
    border-color: var(--theme-accent);
    box-shadow: inset 0 0 0 2px var(--theme-accent);
    touch-action: none;
  }

  .post-timeline-item.dimmed {
    opacity: 0.4;
  }

  .trim-handle {
    position: absolute;
    top: 3px;
    bottom: 3px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    border: 0;
    background: transparent;
    cursor: ew-resize;
    touch-action: none;
  }

  .trim-handle.trim-start {
    transform: translateX(-50%);
  }

  .trim-handle.trim-end {
    transform: translateX(-50%);
  }

  .handle-grip {
    width: 4px;
    height: min(60%, 2rem);
    border-radius: 999px;
    background: var(--theme-accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-text, #fff) 40%, transparent);
  }

  .trim-handle:focus-visible .handle-grip {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Keyframe marker: a small rotated-square diamond centered on its time,
     with the same 44px hit width as .trim-handle so it stays reachable on
     touch even though the visible glyph is much smaller. */
  .kf-marker {
    position: absolute;
    top: 3px;
    bottom: 3px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    transform: translateX(-50%);
    border: 0;
    background: transparent;
    cursor: pointer;
    touch-action: none;
  }

  .kf-marker-glyph {
    font-size: 0.5rem;
    color: var(--theme-accent, #d4813a);
    filter: drop-shadow(0 0 0 1px var(--theme-bg, #101018));
  }

  .kf-marker:focus-visible .kf-marker-glyph {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .kf-marker:hover .kf-marker-glyph {
      color: var(--theme-text, #fff);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .post-timeline-item {
      transition: none;
    }
  }
</style>
