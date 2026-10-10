<script lang="ts">
  import { Popover } from "bits-ui";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  /** The −, fit and + cluster that sits above the track headers. */
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
</script>

{#snippet controls()}
  <button
    type="button"
    class="zoom-btn"
    onclick={onZoomOut}
    aria-label={t("post_timeline_zoom_out")}
    title={t("post_timeline_zoom_out")}
  >
    <i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i>
  </button>
  <button
    type="button"
    class="zoom-btn"
    onclick={onFit}
    aria-label={t("post_timeline_zoom_fit")}
    title={t("post_timeline_zoom_fit")}
  >
    <i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i>
  </button>
  <button
    type="button"
    class="zoom-btn"
    onclick={onZoomIn}
    aria-label={t("post_timeline_zoom_in")}
    title={t("post_timeline_zoom_in")}
  >
    <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
  </button>
{/snippet}

<div class="post-timeline-zoom" class:collapse-when-narrow={collapseWhenNarrow}>
  {@render controls()}
</div>

{#if collapseWhenNarrow}
  <div class="compact-zoom">
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="zoom-btn"
            aria-label={t("post_editor_zoom")}
            title={t("post_editor_zoom")}
          >
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          class="zoom-popover"
          aria-label={t("post_editor_zoom")}
        >
          <div class="post-timeline-zoom">
            {@render controls()}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </div>
{/if}

<style>
  .compact-zoom {
    display: none;
    padding: 0.25rem;
  }

  :global(.zoom-popover) {
    z-index: var(--z-dropdown, 1000);
    border: 1px solid var(--theme-stroke-strong, #484755);
    border-radius: 0.5rem;
    background-color: var(--theme-bg-deep, #08080c);
    background-image: linear-gradient(
      var(--theme-panel-bg, #101014),
      var(--theme-panel-bg, #101014)
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
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: var(--font-size-compact, 0.75rem);
    transition:
      background-color var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .zoom-btn:hover {
      border-color: var(--theme-accent);
      background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
      color: var(--theme-text);
    }
  }

  .zoom-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
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
