<!--
  GridSettingsInline.svelte - Inline grid settings for bento layout

  Compact inline controls for grid scale, mode, and prop visibility.
  Designed to fit within a collapsible section.
-->
<script lang="ts">
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    gridScale: number;
    gridMode: GridMode;
    propsVisible?: boolean;
    onGridScaleChange?: (scale: number) => void;
    onGridModeChange?: (mode: GridMode) => void;
    onPropsVisibilityChange?: (visible: boolean) => void;
  }

  let {
    gridScale,
    gridMode,
    propsVisible = true,
    onGridScaleChange,
    onGridModeChange,
    onPropsVisibilityChange,
  }: Props = $props();

  function decreaseScale() {
    onGridScaleChange?.(Math.max(0.5, gridScale - 0.1));
  }

  function increaseScale() {
    onGridScaleChange?.(Math.min(1.5, gridScale + 0.1));
  }

  function resetScale() {
    onGridScaleChange?.(1.0);
  }
</script>

<div class="settings-inline">
  <!-- Grid Mode Toggle -->
  <div class="setting-row">
    <span class="setting-label">{t('train_grid_mode')}</span>
    <div class="mode-toggle">
      <button
        class="toggle-option"
        class:active={gridMode === GridMode.BOX}
        onclick={() => onGridModeChange?.(GridMode.BOX)}
        aria-label="Box mode"
      >
        <i class="fas fa-square" aria-hidden="true"></i>
      </button>
      <button
        class="toggle-option"
        class:active={gridMode === GridMode.DIAMOND}
        onclick={() => onGridModeChange?.(GridMode.DIAMOND)}
        aria-label="Diamond mode"
      >
        <i class="fas fa-diamond" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <!-- Grid Scale -->
  <div class="setting-row">
    <span class="setting-label">{t('train_grid_size')}</span>
    <div class="scale-controls">
      <button
        class="scale-btn"
        onclick={decreaseScale}
        disabled={gridScale <= 0.5}
        aria-label="Decrease grid size"
      >
        <i class="fas fa-minus" aria-hidden="true"></i>
      </button>
      <span class="scale-value">{Math.round(gridScale * 100)}%</span>
      <button
        class="scale-btn"
        onclick={increaseScale}
        disabled={gridScale >= 1.5}
        aria-label="Increase grid size"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
      {#if gridScale !== 1.0}
        <button class="reset-btn" onclick={resetScale} aria-label="Reset scale">
          <i class="fas fa-undo" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  </div>

  <!-- Props Visibility -->
  {#if onPropsVisibilityChange}
    <div class="setting-row">
      <span class="setting-label">{t('train_props')}</span>
      <button
        class="visibility-toggle"
        class:active={propsVisible}
        onclick={() => onPropsVisibilityChange?.(!propsVisible)}
        aria-label={propsVisible ? "Hide props" : "Show props"}
      >
        <i
          class="fas {propsVisible ? 'fa-eye' : 'fa-eye-slash'}"
          aria-hidden="true"
        ></i>
        <span>{propsVisible ? t('train_visible') : t('train_hidden')}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .settings-inline {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .setting-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.03em;
    min-width: 40px;
  }

  /* Mode Toggle */
  .mode-toggle {
    display: flex;
    gap: 4px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    padding: 3px;
  }

  .toggle-option {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.9rem;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .toggle-option:hover {
    background: var(--theme-card-hover-bg);
    color: color-mix(in srgb, var(--theme-text, white) 80%, transparent);
  }

  .toggle-option.active {
    background: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 20%,
      transparent
    );
    color: var(--semantic-info, var(--semantic-info));
  }

  /* Scale Controls */
  .scale-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .scale-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: color-mix(in srgb, var(--theme-text, white) 70%, transparent);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .scale-btn:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 40%,
      transparent
    );
    color: var(--semantic-info, var(--semantic-info));
  }

  .scale-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .scale-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .scale-value {
    min-width: var(--min-touch-target);
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--semantic-info, var(--semantic-info));
    font-variant-numeric: tabular-nums;
  }

  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .reset-btn:hover {
    background: var(--theme-stroke);
    color: color-mix(in srgb, var(--theme-text, white) 80%, transparent);
  }

  /* Visibility Toggle */
  .visibility-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .visibility-toggle i {
    font-size: 0.85rem;
  }

  .visibility-toggle:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke-strong));
    color: color-mix(in srgb, var(--theme-text, white) 80%, transparent);
  }

  .visibility-toggle.active {
    background: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 30%,
      transparent
    );
    color: var(--semantic-info, var(--semantic-info));
  }

  /* Focus states */
  .toggle-option:focus-visible,
  .scale-btn:focus-visible,
  .reset-btn:focus-visible,
  .visibility-toggle:focus-visible {
    outline: 2px solid
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 60%,
        transparent
      );
    outline-offset: 2px;
  }
</style>
