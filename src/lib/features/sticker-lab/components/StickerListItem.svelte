<script lang="ts">
  import type { StickerUnit, StickerVariant, StickerBackground } from "../domain/sticker-types";
  import { getStickerLabContext } from "../context/sticker-lab-context";
  import { MAX_COPIES_PER_STICKER } from "../domain/sticker-constants";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  interface Props {
    sticker: StickerUnit;
  }
  let { sticker }: Props = $props();

  const state = getStickerLabContext();

  const variantOptions: {
    value: StickerVariant;
    label: string;
    tone?: "blue" | "red";
  }[] = [
    { value: "left", label: "Left", tone: "blue" },
    { value: "right", label: "Right", tone: "red" },
    { value: "full", label: "Full" },
  ];

  const backgroundOptions = [
    { value: "transparent" as StickerBackground, label: "Clear" },
    { value: "white" as StickerBackground, label: "White" },
    { value: "radial-gradient" as StickerBackground, label: "Soft" },
  ];

  function bump(delta: number) {
    state.setCopies(sticker.id, sticker.copies + delta);
  }
</script>

<article class="item" data-sticker-id={sticker.id}>
  <div class="row-primary">
    <span class="word">{sticker.primitiveRef.displayName ?? sticker.primitiveRef.shapeHash.slice(0, 8)}</span>
    <button
      class="remove"
      aria-label="Remove sticker"
      onclick={() => state.removeSticker(sticker.id)}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>
  </div>

  <div class="control-group">
    <span class="section-label">Variant</span>
    <SegmentedControl
      options={variantOptions}
      value={sticker.variant}
      onchange={(v) => state.setVariant(sticker.id, v)}
      color="accent"
      size="sm"
    />
  </div>

  <div class="control-group">
    <span class="section-label">Background</span>
    <SegmentedControl
      options={backgroundOptions}
      value={sticker.background}
      onchange={(b) => state.setBackground(sticker.id, b)}
      color="accent"
      size="sm"
    />
  </div>

  <div class="row-copies">
    <span class="copies-label">Copies</span>
    <div class="copies-controls">
      <button
        class="copies-btn"
        aria-label="Decrease copies"
        onclick={() => bump(-1)}
        disabled={sticker.copies <= 1}
      >−</button>
      <span class="count">{sticker.copies}</span>
      <button
        class="copies-btn"
        aria-label="Increase copies"
        onclick={() => bump(1)}
        disabled={sticker.copies >= MAX_COPIES_PER_STICKER}
      >+</button>
    </div>
  </div>
</article>

<style>
  .item {
    display: grid;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: var(--radius-2026-sm);
    color: var(--theme-text, white);
  }

  .row-primary {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .word {
    font-weight: 600;
    font-size: var(--font-size-base);
    flex: 1;
  }

  .remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: none;
    border-radius: var(--radius-2026-sm);
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: var(--font-size-base);
    transition: color var(--duration-fast), background var(--duration-fast);
  }
  .remove:hover {
    color: var(--semantic-error, #ef4444);
    background: rgba(239, 68, 68, 0.1);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .section-label {
    font-size: var(--font-size-compact);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--theme-text-dim);
  }

  .row-copies {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .copies-label {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .copies-controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-left: auto;
  }

  .copies-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, white);
    font-size: var(--font-size-lg);
    cursor: pointer;
    transition: background var(--duration-fast);
  }
  .copies-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
  .copies-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .count {
    min-width: 32px;
    text-align: center;
    font-weight: 600;
    font-size: var(--font-size-lg);
  }
</style>
