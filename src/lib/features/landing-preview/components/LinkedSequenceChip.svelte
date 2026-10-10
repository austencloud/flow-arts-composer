<script lang="ts">
  import type { LinkedSequence } from "../types";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";

  interface Props {
    sequence: LinkedSequence;
    onRemove: () => void;
    disabled?: boolean;
  }

  let { sequence, onRemove, disabled = false }: Props = $props();
</script>

<div class="chip">
  <div class="linked-badge" aria-label="Linked">
    <i class="fas fa-check" aria-hidden="true"></i>
  </div>
  {#if sequence.thumbnail}
    <img src={sequence.thumbnail} alt="" class="thumbnail" />
  {:else}
    <div class="thumbnail-placeholder">
      <i class="fas fa-layer-group" aria-hidden="true"></i>
    </div>
  {/if}
  <div class="info">
    <span class="word"><TKAWordGlyph word={sequence.word} height={13} /></span>
    {#if sequence.ownerName}
      <span class="owner">by {sequence.ownerName}</span>
    {/if}
  </div>
  <button
    class="remove-btn"
    onclick={onRemove}
    {disabled}
    title="Remove link"
  >
    <i class="fas fa-times" aria-hidden="true"></i>
  </button>
</div>

<style>
  .chip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--semantic-success, #10b981) 8%, transparent);
    border: 2px solid color-mix(in srgb, var(--semantic-success, #10b981) 50%, transparent);
    border-radius: 10px;
    position: relative;
  }

  .linked-badge {
    position: absolute;
    top: -8px;
    left: -8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--semantic-success, #10b981);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
  }

  .thumbnail,
  .thumbnail-placeholder {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .thumbnail {
    object-fit: cover;
  }

  .thumbnail-placeholder {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 14px;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .word {
    font-weight: 600;
    font-size: 14px;
    color: var(--theme-text, white);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .owner {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .remove-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  .remove-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>
