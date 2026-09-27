<!--
  MediaPieceCard.svelte

  Individual media piece card for Composite mode.
  Displays preview of animation, static, grid, or performance video with gear settings overlay.

  Features:
  - Renders actual content based on format (animation/static/grid/performance)
  - Gear icon overlay (top-right corner)
  - Format label (bottom-left corner)
  - Hover state reveals controls

  Domain: Export Panel - Composite Mode - Media Piece
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getExportPanelState } from "../../state/export-panel-state.svelte";
  import type { MediaFormat } from "../../domain/models/media-format";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";

  let {
    pieceIndex,
    format,
    label,
  }: {
    pieceIndex: 1 | 2;
    format: "animation" | "static" | "grid" | "performance";
    label: string;
  } = $props();

  const hubState = getExportPanelState();
  let isHovered = $state(false);

  // Map format to icon
  const formatIcon = $derived(
    format === "animation"
      ? "fa-play-circle"
      : format === "static"
        ? "fa-image"
        : format === "grid"
          ? "fa-th"
          : "fa-video"
  );

  // Map format to MediaFormat for settings
  const settingsFormat = $derived(
    format === "grid" ? ("static" as MediaFormat) : (format as MediaFormat)
  );

  // Get steps for static/grid preview (limit based on format)
  const previewSteps = $derived.by(() => {
    if (!hubState.sequence?.steps) return [];
    const limit = format === "grid" ? 4 : 1;
    return hubState.sequence.steps.slice(0, limit);
  });

  function handleSettingsClick() {
    hubState.settingsPanelOpen = true;
    hubState.settingsContext = { format: settingsFormat, pieceIndex };
  }
</script>

<div
  class="media-piece-card"
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  role="region"
  aria-label="{label} preview"
>
  <!-- Preview Content -->
  <div class="preview-content">
    {#if !hubState.sequence}
      <div class="placeholder-preview">
        <i class="fas {formatIcon}" aria-hidden="true"></i>
        <p>No sequence</p>
      </div>
    {:else if format === "animation"}
      <!-- Animation: show single pictograph preview -->
      {#if previewSteps.length > 0}
        <div class="animation-preview-mini">
          <PictographContainer
            pictographData={previewSteps[0]}
            disableTransitions={true}
          />
          <div class="play-overlay">
            <i class="fas fa-play" aria-hidden="true"></i>
          </div>
        </div>
      {:else}
        <div class="placeholder-preview">
          <i class="fas fa-play-circle" aria-hidden="true"></i>
          <p>{t("export_ui_no_steps")}</p>
        </div>
      {/if}
    {:else if format === "static"}
      <!-- Static: show first pictograph -->
      {#if previewSteps.length > 0}
        <div class="static-preview-mini">
          <PictographContainer
            pictographData={previewSteps[0]}
            disableTransitions={true}
          />
        </div>
      {:else}
        <div class="placeholder-preview">
          <i class="fas fa-image" aria-hidden="true"></i>
          <p>{t("export_ui_no_steps")}</p>
        </div>
      {/if}
    {:else if format === "grid"}
      <!-- Grid: show 2x2 mini grid -->
      {#if previewSteps.length > 0}
        <div class="grid-preview-mini">
          {#each previewSteps as beat, index (beat.id ?? index)}
            <div class="grid-cell">
              <PictographContainer
                pictographData={beat}
                disableTransitions={true}
              />
            </div>
          {/each}
        </div>
      {:else}
        <div class="placeholder-preview">
          <i class="fas fa-th" aria-hidden="true"></i>
          <p>{t("export_ui_no_steps")}</p>
        </div>
      {/if}
    {:else if format === "performance"}
      <!-- Performance: camera/video placeholder -->
      <div class="placeholder-preview">
        <i class="fas fa-video" aria-hidden="true"></i>
        <p>{t("export_ui_performance")}</p>
      </div>
    {/if}
  </div>

  <!-- Format Label (bottom-left) -->
  <div class="format-label">
    <i class="fas {formatIcon}" aria-hidden="true"></i>
    <span>{label}</span>
  </div>

  <!-- Settings Gear (top-right) -->
  <button
    class="settings-gear"
    class:visible={isHovered}
    onclick={handleSettingsClick}
    aria-label="Settings for {label}"
  >
    <i class="fas fa-cog" aria-hidden="true"></i>
  </button>
</div>

<style>
  .media-piece-card {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color var(--duration-normal) ease;
  }

  .media-piece-card:hover {
    border-color: var(--theme-accent);
  }

  .preview-content {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }

  .placeholder-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--theme-text-dim);
  }

  .placeholder-preview i {
    font-size: var(--font-size-3xl);
    opacity: 0.3;
  }

  .placeholder-preview p {
    font-size: var(--font-size-compact);
    margin: 0;
  }

  /* Animation preview with play overlay */
  .animation-preview-mini {
    position: relative;
    width: 100%;
    height: 100%;
    background: white;
    border-radius: 8px;
    overflow: hidden;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, #000 30%, transparent);
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .animation-preview-mini:hover .play-overlay {
    opacity: 1;
  }

  .play-overlay i {
    font-size: var(--font-size-2xl);
    color: white;
    text-shadow: 0 2px 4px color-mix(in srgb, #000 30%, transparent);
  }

  /* Static preview */
  .static-preview-mini {
    width: 100%;
    height: 100%;
    background: white;
    border-radius: 8px;
    overflow: hidden;
  }

  /* Grid preview */
  .grid-preview-mini {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
    width: 100%;
    height: 100%;
  }

  .grid-cell {
    aspect-ratio: 1 / 1;
    background: white;
    border-radius: 4px;
    overflow: hidden;
  }

  .format-label {
    position: absolute;
    bottom: 8px;
    left: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: color-mix(in srgb, #000 70%, transparent);
    backdrop-filter: blur(8px);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: white;
  }

  .format-label i {
    font-size: var(--font-size-compact);
  }

  .settings-gear {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    color: white;
    cursor: pointer;
    opacity: 0;
    transition: all var(--duration-normal) ease;
    transform: scale(0.9);
  }

  .settings-gear.visible {
    opacity: 1;
    transform: scale(1);
  }

  .settings-gear:hover {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    transform: scale(1.05);
  }

  .settings-gear:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
    opacity: 1;
    transform: scale(1);
  }

  .settings-gear i {
    font-size: var(--font-size-sm);
  }

  /* Mobile - always show settings gear */
  @media (max-width: 768px) {
    .settings-gear {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .media-piece-card,
    .settings-gear,
    .play-overlay {
      transition: none;
    }

    .settings-gear:hover {
      transform: scale(1);
    }
  }
</style>
