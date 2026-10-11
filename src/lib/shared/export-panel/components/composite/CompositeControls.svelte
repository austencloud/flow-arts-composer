<!--
  CompositeControls.svelte

  Controls for Composite mode layout and piece selection.
  Allows user to toggle orientation and select formats for each piece.

  Features:
  - Orientation toggle (horizontal/vertical)
  - Piece 1 format selector (animation/static)
  - Piece 2 format selector (grid/performance)
  - Compact, inline layout
  - Theme-based styling

  Domain: Export Panel - Composite Mode - Controls
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getExportPanelState } from "../../state/export-panel-state.svelte";

  const hubState = getExportPanelState();

  function toggleOrientation() {
    const newOrientation =
      hubState.compositeLayout.orientation === "horizontal"
        ? "vertical"
        : "horizontal";
    hubState.compositeLayout.orientation = newOrientation;
  }

  function handlePiece1Change(format: "animation" | "static") {
    hubState.compositeLayout.piece1 = format;
  }

  function handlePiece2Change(format: "grid" | "performance") {
    hubState.compositeLayout.piece2 = format;
  }
</script>

<div class="composite-controls">
  <!-- Orientation Toggle -->
  <div class="control-group">
    <span class="control-label">
      <i class="fas fa-arrows-alt" aria-hidden="true"></i>
      Layout
    </span>
    <button
      class="orientation-toggle"
      onclick={toggleOrientation}
      aria-label="Toggle orientation"
    >
      {#if hubState.compositeLayout.orientation === "horizontal"}
        <i class="fas fa-grip-horizontal" aria-hidden="true"></i>
        <span>Horizontal</span>
      {:else}
        <i class="fas fa-grip-vertical" aria-hidden="true"></i>
        <span>Vertical</span>
      {/if}
    </button>
  </div>

  <!-- Piece 1 Selector -->
  <div class="control-group">
    <span class="control-label">
      <i class="fas fa-play-circle" aria-hidden="true"></i>
      Piece 1
    </span>
    <div class="piece-selector" role="group" aria-label="Piece 1 format">
      <button
        class="piece-option"
        class:active={hubState.compositeLayout.piece1 === "animation"}
        onclick={() => handlePiece1Change("animation")}
        aria-pressed={hubState.compositeLayout.piece1 === "animation"}
      >
        <i class="fas fa-play-circle" aria-hidden="true"></i>
        <span>{t("export_ui_animation")}</span>
      </button>
      <button
        class="piece-option"
        class:active={hubState.compositeLayout.piece1 === "static"}
        onclick={() => handlePiece1Change("static")}
        aria-pressed={hubState.compositeLayout.piece1 === "static"}
      >
        <i class="fas fa-image" aria-hidden="true"></i>
        <span>{t("create_type_static")}</span>
      </button>
    </div>
  </div>

  <!-- Piece 2 Selector -->
  <div class="control-group">
    <span class="control-label">
      <i class="fas fa-th" aria-hidden="true"></i>
      Piece 2
    </span>
    <div class="piece-selector" role="group" aria-label="Piece 2 format">
      <button
        class="piece-option"
        class:active={hubState.compositeLayout.piece2 === "grid"}
        onclick={() => handlePiece2Change("grid")}
        aria-pressed={hubState.compositeLayout.piece2 === "grid"}
      >
        <i class="fas fa-th" aria-hidden="true"></i>
        <span>{t("generator_grid")}</span>
      </button>
      <button
        class="piece-option"
        class:active={hubState.compositeLayout.piece2 === "performance"}
        onclick={() => handlePiece2Change("performance")}
        aria-pressed={hubState.compositeLayout.piece2 === "performance"}
      >
        <i class="fas fa-video" aria-hidden="true"></i>
        <span>{t("export_ui_performance")}</span>
      </button>
    </div>
  </div>
</div>

<style>
  .composite-controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: space-between;
  }

  .control-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text, white);
    min-width: 80px;
  }

  .control-label i {
    font-size: var(--font-size-sm);
    opacity: 0.7;
  }

  .orientation-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    min-height: var(--min-touch-target); /* WCAG 2.1 AA touch target */
    background: var(--theme-accent);
    border: 1px solid var(--theme-accent);
    border-radius: 8px;
    font-size: var(--font-size-min);
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .orientation-toggle i {
    font-size: var(--font-size-base);
  }

  .orientation-toggle:hover {
    background: var(--theme-accent-hover);
    transform: translateY(-1px);
  }

  .orientation-toggle:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .piece-selector {
    display: flex;
    gap: 8px;
  }

  .piece-option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    min-height: var(--min-touch-target); /* WCAG 2.1 AA touch target */
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    white-space: nowrap;
  }

  .piece-option i {
    font-size: var(--font-size-sm);
  }

  .piece-option:hover {
    border-color: var(--theme-accent);
    color: var(--theme-text, white);
    transform: translateY(-1px);
  }

  .piece-option:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .piece-option.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  /* Mobile optimization */
  @media (max-width: 768px) {
    .composite-controls {
      padding: 14px;
      gap: 14px;
    }

    .control-group {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .control-label {
      min-width: 0;
    }

    .piece-selector {
      width: 100%;
    }

    .piece-option {
      flex: 1;
      justify-content: center;
    }

    .orientation-toggle {
      width: 100%;
      justify-content: center;
    }
  }

  /* Tablet */
  @media (min-width: 769px) and (max-width: 1024px) {
    .piece-option span {
      display: none;
    }

    .piece-option {
      padding: 8px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .orientation-toggle,
    .piece-option {
      transition: none;
    }

    .orientation-toggle:hover,
    .piece-option:hover {
      transform: none;
    }
  }
</style>
