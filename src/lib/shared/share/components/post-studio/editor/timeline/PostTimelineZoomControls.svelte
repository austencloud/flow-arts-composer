<script lang="ts">
  import { Popover } from "@austencloud/video-editor/ui";
  import { useStrings } from "@austencloud/video-editor/strings";
  import {
    Icon,
    faArrowsLeftRight,
    faChevronDown,
    faMagnifyingGlass,
    faMagnifyingGlassMinus,
    faMagnifyingGlassPlus,
  } from "@austencloud/video-editor/icons";

  const t = useStrings();

  /** The minus, fit and plus cluster that sits above the track headers. */
  interface Props {
    collapseWhenNarrow?: boolean;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onFit: () => void;
  }

  let {
    collapseWhenNarrow = false,
    onZoomOut,
    onZoomIn,
    onFit,
  }: Props = $props();

  let open = $state(false);
  let anchor = $state<HTMLElement | null>(null);
</script>

{#snippet controls()}
  <button
    type="button"
    class="zoom-btn"
    onclick={onZoomOut}
    aria-label={t("post_timeline_zoom_out")}
    title={t("post_timeline_zoom_out")}
  >
    <Icon icon={faMagnifyingGlassMinus} />
  </button>
  <button
    type="button"
    class="zoom-btn"
    onclick={onFit}
    aria-label={t("post_timeline_zoom_fit")}
    title={t("post_timeline_zoom_fit")}
  >
    <Icon icon={faArrowsLeftRight} />
  </button>
  <button
    type="button"
    class="zoom-btn"
    onclick={onZoomIn}
    aria-label={t("post_timeline_zoom_in")}
    title={t("post_timeline_zoom_in")}
  >
    <Icon icon={faMagnifyingGlassPlus} />
  </button>
{/snippet}

<div class="post-timeline-zoom" class:collapse-when-narrow={collapseWhenNarrow}>
  {@render controls()}
</div>

{#if collapseWhenNarrow}
  <div class="compact-zoom">
    <button
      bind:this={anchor}
      type="button"
      class="zoom-btn"
      aria-label={t("post_editor_zoom")}
      title={t("post_editor_zoom")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <Icon icon={faMagnifyingGlass} />
      <Icon icon={faChevronDown} />
    </button>
    <Popover
      bind:open
      {anchor}
      label={t("post_editor_zoom")}
      placement="top"
      offset={8}
    >
      <div class="zoom-popover">
        <div class="post-timeline-zoom">
          {@render controls()}
        </div>
      </div>
    </Popover>
  </div>
{/if}

<style>
  .compact-zoom {
    display: none;
    padding: 0.25rem;
  }

  .zoom-popover {
    border: 1px solid var(--ve-theme-stroke-strong, #484755);
    border-radius: 0.5rem;
    background-color: var(--ve-theme-bg-deep, #08080c);
    background-image: linear-gradient(
      var(--ve-theme-panel-bg, #101014),
      var(--ve-theme-panel-bg, #101014)
    );
  }

  .post-timeline-zoom {
    display: flex;
    flex-shrink: 0;
    gap: 0.25rem;
    padding: 0.25rem;
  }

  @container post-timeline-header (max-width: 10rem) {
    .collapse-when-narrow {
      display: none;
    }

    .compact-zoom {
      display: flex;
    }
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-width: var(--ve-min-touch-target, 44px);
    min-height: var(--ve-min-touch-target, 44px);
    border: 1px solid var(--ve-theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.5rem;
    background: var(--ve-theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--ve-theme-text-dim);
    cursor: pointer;
    font-size: var(--ve-font-size-compact, 0.75rem);
    transition:
      background-color var(--ve-duration-fast, 150ms) ease,
      border-color var(--ve-duration-fast, 150ms) ease,
      color var(--ve-duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .zoom-btn:hover {
      border-color: var(--ve-theme-accent);
      background: color-mix(in srgb, var(--ve-theme-accent) 12%, transparent);
      color: var(--ve-theme-text);
    }
  }

  .zoom-btn:focus-visible {
    outline: 2px solid var(--ve-theme-accent);
    outline-offset: 2px;
  }

  .zoom-btn:active {
    transform: scale(0.96);
  }

  @media (prefers-reduced-motion: reduce) {
    .zoom-btn {
      transition: none;
    }
  }
</style>
