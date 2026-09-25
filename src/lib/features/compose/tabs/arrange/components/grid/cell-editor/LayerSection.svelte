<!--
  LayerSection.svelte

  Displays the cell's sequence layers as chips with prop color dots,
  word, beat count, and copy/remove actions. Also renders the
  Add Layer and Paste buttons below the list.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { GridCell } from "../../../state/arrange-grid-state.svelte";
  import type { TunnelLayerConfig } from "$lib/shared/animation-engine/domain/compose-types";

  const MAX_LAYERS = 4;

  let {
    cell,
    clipboardHasData = false,
    transformingLayer = null,
    onAddSequence,
    onRemoveLayer,
    onCopyLayer,
    onPasteLayer,
  }: {
    cell: GridCell;
    clipboardHasData?: boolean;
    transformingLayer?: { cellId: string; layerIndex: number } | null;
    onAddSequence: () => void;
    onRemoveLayer: (layerIndex: number) => void;
    onCopyLayer?: (layerIndex: number) => void;
    onPasteLayer?: () => void;
  } = $props();

  const canAddLayer = $derived(cell.layers.length < MAX_LAYERS);

  function getLayerName(layer: TunnelLayerConfig, index: number): string {
    return (
      layer.sequence.word || layer.sequence.name || `Sequence ${index + 1}`
    );
  }

  function getLayerBeats(layer: TunnelLayerConfig): number {
    return layer.sequence.steps?.length || 0;
  }
</script>

<section class="layer-section">
  <div class="section-header">
    <span class="section-label">
      Layers
      {#if cell.layers.length > 1}
        <span class="mode-badge tunnel">
          <i class="fas fa-layer-group" aria-hidden="true"></i>
          Tunnel
        </span>
      {/if}
    </span>
    <span class="count">{cell.layers.length}/{MAX_LAYERS}</span>
  </div>

  {#if cell.layers.length === 0}
    <div class="empty-layers">
      <p>{t("compose_ui_no_sequences_yet")}</p>
      <button class="add-sequence-btn" onclick={onAddSequence}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{t("compose_ui_add_sequence")}</span>
      </button>
      {#if clipboardHasData && onPasteLayer}
        <button class="paste-btn" onclick={onPasteLayer}>
          <i class="fas fa-paste" aria-hidden="true"></i>
          <span>{t("compose_ui_paste")}</span>
        </button>
      {/if}
    </div>
  {:else}
    <div class="layer-list">
      {#each cell.layers as layer, index}
        <div
          class="layer-chip"
          style:--left-color={layer.propColors.left}
          style:--right-color={layer.propColors.right}
        >
          <div class="chip-colors">
            <span
              class="color-dot"
              style:background={layer.propColors.left}
              style:--dot-color={layer.propColors.left}
            ></span>
            <span
              class="color-dot"
              style:background={layer.propColors.right}
              style:--dot-color={layer.propColors.right}
            ></span>
          </div>
          <div class="chip-info">
            <span class="chip-name">{getLayerName(layer, index)}</span>
            <span class="chip-meta">
              Layer {index + 1} &middot; {getLayerBeats(layer)} beats
            </span>
          </div>
          <div class="chip-actions">
            {#if onCopyLayer}
              <button
                class="chip-action-btn"
                onclick={() => onCopyLayer(index)}
                aria-label="Copy layer {index + 1}"
                title={t("browse_copy")}
              >
                <i class="fas fa-copy" aria-hidden="true"></i>
              </button>
            {/if}
            <button
              class="chip-action-btn danger"
              onclick={() => onRemoveLayer(index)}
              aria-label="Remove layer {index + 1}"
              title="Remove"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      {/each}
    </div>

    <div class="layer-add-actions">
      {#if canAddLayer}
        <button class="add-sequence-btn" onclick={onAddSequence}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>Add Layer ({cell.layers.length + 1}/{MAX_LAYERS})</span>
        </button>
      {/if}
      {#if clipboardHasData && canAddLayer && onPasteLayer}
        <button class="paste-btn" onclick={onPasteLayer}>
          <i class="fas fa-paste" aria-hidden="true"></i>
          <span>{t("compose_ui_paste")}</span>
        </button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .layer-section {
    display: flex;
    flex-direction: column;
    gap: clamp(8px, 2cqi, 12px);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: clamp(6px, 2cqi, 10px);
    font-size: clamp(0.75rem, 2.5cqi, 0.85rem);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .mode-badge.tunnel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px clamp(6px, 1.5cqi, 8px);
    border-radius: clamp(3px, 1cqi, 4px);
    font-size: clamp(0.65rem, 2cqi, 0.75rem);
    font-weight: 500;
    text-transform: none;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 20%,
      transparent
    );
    color: color-mix(
      in srgb,
      var(--theme-accent-light, #a78bfa) 95%,
      transparent
    );
  }

  .count {
    font-size: clamp(0.7rem, 2.2cqi, 0.8rem);
    font-weight: 400;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  /* Empty state */
  .empty-layers {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(10px, 3cqi, 16px);
    padding: clamp(16px, 4cqi, 24px);
    text-align: center;
  }

  .empty-layers p {
    margin: 0;
    font-size: clamp(0.8rem, 2.8cqi, 0.9rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  /* Layer chips */
  .layer-list {
    display: flex;
    flex-direction: column;
    gap: clamp(6px, 2cqi, 10px);
  }

  .layer-chip {
    display: flex;
    align-items: center;
    gap: clamp(8px, 2cqi, 12px);
    min-height: 52px;
    padding: clamp(8px, 2cqi, 12px) clamp(10px, 2.5cqi, 14px);
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--left-color) 8%, transparent),
      color-mix(in srgb, var(--right-color) 8%, transparent)
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: var(--action-radius, 10px);
  }

  .chip-colors {
    display: flex;
    gap: clamp(3px, 1cqi, 4px);
    flex-shrink: 0;
  }

  .color-dot {
    width: clamp(12px, 3cqi, 14px);
    height: clamp(12px, 3cqi, 14px);
    border-radius: 50%;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    box-shadow: 0 0 6px
      color-mix(in srgb, var(--dot-color, currentColor) 25%, transparent);
  }

  .chip-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chip-name {
    font-size: clamp(0.8rem, 2.8cqi, 0.95rem);
    color: var(--theme-text, white);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip-meta {
    font-size: clamp(0.7rem, 2.2cqi, 0.8rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .chip-actions {
    display: flex;
    gap: clamp(2px, 0.5cqi, 4px);
    flex-shrink: 0;
  }

  .chip-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    border-radius: var(--action-radius, 10px);
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .chip-action-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, white);
  }

  .chip-action-btn.danger:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 8%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, transparent);
  }

  /* Add / Paste buttons */
  .layer-add-actions {
    display: flex;
    flex-direction: column;
    gap: var(--chip-gap, clamp(6px, 1.5cqi, 8px));
    margin-top: clamp(4px, 1cqi, 8px);
  }

  .add-sequence-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--chip-gap, clamp(6px, 1.5cqi, 8px));
    min-height: 44px;
    padding: 10px 14px;
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 4%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #10b981) 10%, transparent);
    border-radius: var(--action-radius, 10px);
    color: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 55%,
      transparent
    );
    font-size: clamp(0.8rem, 2.8cqi, 0.95rem);
    font-weight: 500;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease;
  }

  .add-sequence-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 8%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 20%,
      transparent
    );
    color: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 75%,
      transparent
    );
  }

  .paste-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--chip-gap, clamp(6px, 1.5cqi, 8px));
    min-height: 44px;
    padding: 10px 14px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 4%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 10%, transparent);
    border-radius: var(--action-radius, 10px);
    color: color-mix(
      in srgb,
      var(--theme-accent-light, #a78bfa) 55%,
      transparent
    );
    font-size: clamp(0.8rem, 2.8cqi, 0.95rem);
    font-weight: 500;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease;
  }

  .paste-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 8%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 20%,
      transparent
    );
    color: color-mix(
      in srgb,
      var(--theme-accent-light, #a78bfa) 75%,
      transparent
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .chip-action-btn,
    .add-sequence-btn,
    .paste-btn {
      transition: none;
    }
  }
</style>
