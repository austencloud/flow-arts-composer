<!--
	CompositionHeroCard.svelte

	Larger card variant for the most recent composition.
	Spans 2 columns, 16:9 aspect ratio, shows more metadata,
	and a quick-action overlay on hover.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  import {
    resolveThumbnail,
    generatePlaceholderSvg,
  } from "$lib/features/compose/tabs/browse/services/composition-thumbnail-resolver";
  import type { CompositionBrowseItem } from "../state/composition-browse-state.svelte";
  import { COMPOSE_MODE_CONFIG } from "$lib/features/compose/shared/domain/compose-mode-config";
  import CompositionMiniPreview from "./CompositionMiniPreview.svelte";

  const {
    composition,
    staggerIndex = 0,
    onExpand,
    onToggleFavorite,
    onPlay,
    onEdit,
  }: {
    composition: CompositionBrowseItem;
    staggerIndex?: number;
    onExpand: (item: CompositionBrowseItem) => void;
    onToggleFavorite?: (id: string) => void;
    onPlay?: (id: string) => void;
    onEdit?: (id: string) => void;
  } = $props();

  const modeConfig = $derived(COMPOSE_MODE_CONFIG[composition.mode]);

  const thumbnailUrl = $derived(resolveThumbnail(composition));
  const placeholderSvg = $derived(
    generatePlaceholderSvg(composition.mode, modeConfig.accent)
  );

  const hasRenderableCells = $derived(
    composition.cells.length > 0 && composition.sequenceCount > 0
  );

  const layoutLabel = $derived(
    `${composition.layout.cols}x${composition.layout.rows}`
  );

  const lastEdited = $derived(
    composition.updatedAt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  );

  function handleClick() {
    onExpand(composition);
  }

  function handlePlay(e: MouseEvent) {
    e.stopPropagation();
    onPlay?.(composition.id);
  }

  function handleEdit(e: MouseEvent) {
    e.stopPropagation();
    onEdit?.(composition.id);
  }

  function handleFavoriteClick(e: MouseEvent) {
    e.stopPropagation();
    onToggleFavorite?.(composition.id);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  role="button"
  tabindex="0"
  class="hero-card"
  style="
		--stagger-delay: calc(var(--stagger-normal, 50ms) * {staggerIndex});
		view-transition-name: composition-{composition.id};
	"
  onclick={handleClick}
  onkeydown={handleKeyDown}
>
  <!-- Media -->
  <div class="card-media">
    {#if hasRenderableCells}
      <CompositionMiniPreview
        cells={composition.cells}
        layout={composition.layout}
      />
    {:else if thumbnailUrl}
      <img src={thumbnailUrl} alt={composition.name} class="thumbnail" />
    {:else if placeholderSvg}
      <div class="placeholder" style="background: {modeConfig.gradient}">
        <img
          src={placeholderSvg}
          alt=""
          class="placeholder-svg"
          aria-hidden="true"
        />
      </div>
    {:else}
      <div class="placeholder" style="background: {modeConfig.gradient}">
        <i
          class="fas {modeConfig.icon} placeholder-icon"
          style="color: {modeConfig.accent}"
          aria-hidden="true"
        ></i>
      </div>
    {/if}

    <!-- Mode badge -->
    <div class="mode-badge" style="border-color: {modeConfig.accent}">
      <i
        class="fas {modeConfig.icon}"
        style="color: {modeConfig.accent}"
        aria-hidden="true"
      ></i>
      <span>{modeConfig.label}</span>
    </div>

    <!-- Favorite button -->
    <button
      type="button"
      class="favorite-btn"
      class:active={composition.isFavorite}
      title={composition.isFavorite
        ? "Remove from favorites"
        : "Add to favorites"}
      aria-label={composition.isFavorite
        ? "Remove from favorites"
        : "Add to favorites"}
      onclick={handleFavoriteClick}
    >
      <i class="fas fa-heart" aria-hidden="true"></i>
    </button>

    <!-- Quick action overlay -->
    <div class="action-overlay">
      <button
        type="button"
        class="quick-action"
        onclick={handlePlay}
        title={t("learn_play")}
        aria-label={t("learn_play")}
      >
        <i class="fas fa-play" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="quick-action"
        onclick={handleEdit}
        title={t("viewer_edit")}
        aria-label={t("viewer_edit")}
      >
        <i class="fas fa-pen" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <!-- Footer -->
  <div class="card-footer">
    <h3 class="name">{composition.name || "Untitled"}</h3>
    <div class="meta-row">
      <span class="layout-badge">{layoutLabel}</span>
      <span class="detail">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        {composition.sequenceCount} sequence{composition.sequenceCount !== 1
          ? "s"
          : ""}
      </span>
      <span class="detail">
        <i class="fas fa-th" aria-hidden="true"></i>
        {composition.cellCount} cell{composition.cellCount !== 1 ? "s" : ""}
      </span>
      <span class="detail time">{lastEdited}</span>
    </div>
  </div>
</div>

<style>
  .hero-card {
    position: relative;
    grid-column: span 2;
    border-radius: 12px;
    overflow: hidden;
    background: var(--theme-card-bg, rgba(8, 8, 12, 0.9));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0;
    cursor: pointer;
    transition:
      transform var(--duration-fast, 100ms) var(--ease-out, ease-out),
      box-shadow var(--duration-fast, 100ms) var(--ease-out, ease-out),
      border-color var(--duration-fast, 100ms) var(--ease-out, ease-out);
    animation: heroEntrance var(--duration-dramatic, 350ms)
      var(--ease-out, ease-out) both;
    animation-delay: var(--stagger-delay, 0ms);
  }

  .hero-card:hover {
    transform: scale(var(--hover-scale-md, 1.02));
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .hero-card:active {
    transform: scale(var(--active-scale, 0.98));
  }

  .hero-card:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Media - 16:9 aspect */
  .card-media {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    overflow: hidden;
  }

  .thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder-svg {
    width: 40%;
    height: 60%;
    max-width: 120px;
    max-height: 120px;
    opacity: 0.7;
  }

  .placeholder-icon {
    font-size: 48px;
    opacity: 0.5;
  }

  /* Mode badge - larger for hero */
  .mode-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.7));
    border-radius: 8px;
    border: 1px solid;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  /* Favorite button */
  .favorite-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.5));
    border: none;
    border-radius: 8px;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    padding: 0;
    transition: transform var(--duration-fast, 100ms) var(--ease-spring, ease);
  }

  .favorite-btn.active {
    color: var(--semantic-error, #ef4444);
  }

  .favorite-btn:active {
    transform: scale(1.3);
  }

  /* Action overlay on hover */
  .action-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
    opacity: 0;
    transform: translateY(8px);
    transition:
      opacity var(--duration-fast, 100ms) ease,
      transform var(--duration-fast, 100ms) ease;
  }

  .hero-card:hover .action-overlay {
    opacity: 1;
    transform: translateY(0);
  }

  .quick-action {
    width: 44px;
    height: 44px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.15));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 50%;
    color: #fff;
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: background var(--duration-fast, 100ms) ease;
    padding: 0;
  }

  .quick-action:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.25));
  }

  /* Footer */
  .card-footer {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .name {
    font-size: var(--font-size-base, 16px);
    font-weight: 700;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .layout-badge {
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    font-weight: 600;
    font-size: var(--font-size-compact, 12px);
  }

  .detail {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .detail i {
    font-size: 10px;
    opacity: 0.7;
  }

  .time {
    margin-left: auto;
  }

  @keyframes heroEntrance {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-card {
      animation: none;
      transition: none;
    }
    .hero-card:hover {
      transform: none;
    }
    .action-overlay {
      opacity: 1;
      transform: none;
      transition: none;
    }
    .favorite-btn:active {
      transform: none;
    }
  }
</style>
