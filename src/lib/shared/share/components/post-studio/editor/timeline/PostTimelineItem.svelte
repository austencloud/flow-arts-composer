<script lang="ts">
  import type {
    PostItem,
    PostItemKind,
  } from "$lib/shared/media-composition/domain/post-project";
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
    onActivate: (itemId: string, event: MouseEvent) => void;
    onBodyPointerDown: (event: PointerEvent) => void;
    onHandlePointerDown: (event: PointerEvent, edge: "start" | "end") => void;
    /** Whether any channel has keyframes; the keys themselves show in rows under a selected clip. */
    animated: boolean;
    /**
     * This half carries on from the clip before it, or into the clip after
     * it, as one block: the shared edge is flat and has no trim handle.
     */
    joinStart?: boolean;
    joinEnd?: boolean;
    /** The block is an animation's opening tunnel, which selects on its own. */
    tunnel?: boolean;
    /** The stretch this block covers when it shows only part of the item. */
    span?: { start: number; end: number };
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
    animated,
    joinStart = false,
    joinEnd = false,
    tunnel = false,
    span,
  }: Props = $props();

  const KIND_ICON: Record<PostItemKind, string> = {
    video: "fa-solid fa-film",
    image: "fa-solid fa-image",
    card: "fa-solid fa-id-card",
    animation: "fa-solid fa-wand-magic-sparkles",
    moves: "fa-solid fa-arrows-up-down-left-right",
    carousel: "fa-solid fa-images",
    text: "fa-solid fa-font",
    titles: "fa-solid fa-heading",
  };

  const speedLabel = $derived(
    item.kind === "video" && item.speed !== 1 ? `${item.speed}×` : null
  );
  const isMuted = $derived(item.kind === "video" && item.volume === 0);

  const accessibleName = $derived.by(() => {
    const parts = [
      labelText,
      t("post_timeline_item_time_range", {
        start: formatPostClock(span?.start ?? item.start),
        end: formatPostClock(span?.end ?? item.start + item.duration),
      }),
    ];
    if (speedLabel)
      parts.push(t("post_timeline_item_speed", { speed: speedLabel }));
    if (isMuted) parts.push(t("post_timeline_item_muted"));
    if (item.fill) parts.push(t("post_timeline_item_linked"));
    if (animated) parts.push(t("post_timeline_item_animated"));
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
</script>

<button
  type="button"
  class="post-timeline-item kind-{item.kind}"
  class:tunnel
  class:selected
  class:dimmed
  class:join-start={joinStart}
  class:join-end={joinEnd}
  style="left: {leftPx}px; width: {Math.max(widthPx, 2)}px"
  data-item-id={item.id}
  data-part={tunnel ? "tunnel" : undefined}
  aria-pressed={selected}
  aria-label={accessibleName}
  onpointerdown={handleBodyPointerDown}
  onclick={(event) => onActivate(item.id, event)}
>
  <i
    class={tunnel ? "fa-solid fa-fan" : KIND_ICON[item.kind]}
    aria-hidden="true"
  ></i>
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
  {#if animated}
    <i class="fa-solid fa-diamond item-glyph" aria-hidden="true"></i>
  {/if}
  {#if locked}
    <i class="fa-solid fa-lock item-glyph" aria-hidden="true"></i>
  {/if}
</button>

{#if selected && !locked && !joinStart}
  <button
    type="button"
    class="trim-handle trim-start"
    style="left: {leftPx}px"
    aria-label={t("post_timeline_trim_start", { label: labelText })}
    onpointerdown={(event) => handleHandlePointerDown(event, "start")}
  >
    <span class="handle-grip" aria-hidden="true"></span>
  </button>
{/if}

{#if selected && !locked && !joinEnd}
  <button
    type="button"
    class="trim-handle trim-end"
    style="left: {leftPx + widthPx}px"
    aria-label={t("post_timeline_trim_end", { label: labelText })}
    onpointerdown={(event) => handleHandlePointerDown(event, "end")}
  >
    <span class="handle-grip" aria-hidden="true"></span>
  </button>
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
    background: color-mix(
      in srgb,
      var(--kind-tint, var(--theme-accent)) 22%,
      var(--theme-card-bg, #1c1c26)
    );
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
  .post-timeline-item.kind-animation.tunnel {
    --kind-tint: #7cc4fa;
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
    background: color-mix(
      in srgb,
      var(--kind-tint, var(--theme-accent)) 45%,
      transparent
    );
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
      border-color: color-mix(
        in srgb,
        var(--kind-tint, var(--theme-accent)) 60%,
        var(--theme-stroke)
      );
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

  .post-timeline-item.join-start {
    border-left-color: transparent;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .post-timeline-item.join-end {
    border-right-color: transparent;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  /* A selected pair reads as one outline, open where the halves meet. */
  .post-timeline-item.selected.join-start {
    box-shadow:
      inset 0 2px 0 var(--theme-accent),
      inset 0 -2px 0 var(--theme-accent),
      inset -2px 0 0 var(--theme-accent);
  }

  .post-timeline-item.selected.join-end {
    box-shadow:
      inset 0 2px 0 var(--theme-accent),
      inset 0 -2px 0 var(--theme-accent),
      inset 2px 0 0 var(--theme-accent);
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
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-text, #fff) 40%, transparent);
  }

  .trim-handle:focus-visible .handle-grip {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .post-timeline-item {
      transition: none;
    }
  }
</style>
