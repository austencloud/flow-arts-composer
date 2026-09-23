<!--
  PresetChip.svelte - Compact preset chip for 10-slot system

  Empty: Shows slot number with + icon, tap to save current config
  Filled: Shows mini prop icon(s), tap to apply, long-press to clear
  Desktop: Shows keyboard shortcut badge (1-9, 0)
-->
<script lang="ts">
  import type { PropPreset } from "../../../domain/app-settings";
  import { getPropTypeDisplayInfo } from "./prop-type-registry";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  const NO_ROTATE_PROPS = new Set([PropType.HAND]);

  let {
    preset,
    index,
    selected = false,
    showKeyboardBadge = false,
    onSelect,
    onSave,
    onClear,
  } = $props<{
    preset: PropPreset | null;
    index: number;
    selected?: boolean;
    showKeyboardBadge?: boolean;
    onSelect?: () => void;
    onSave?: () => void;
    onClear?: () => void;
  }>();

  const isEmpty = $derived(!preset);
  const leftInfo = $derived(
    preset ? getPropTypeDisplayInfo(preset.leftPropType) : null
  );
  const rightInfo = $derived(
    preset ? getPropTypeDisplayInfo(preset.rightPropType) : null
  );
  // Differing hands are cat dog even when an older preset's flag says false;
  // applying the preset heals it the same way.
  const isCatDog = $derived(
    preset && preset.leftPropType !== preset.rightPropType
  );
  const leftNoRotate = $derived(preset ? NO_ROTATE_PROPS.has(preset.leftPropType) : false);
  const rightNoRotate = $derived(preset ? NO_ROTATE_PROPS.has(preset.rightPropType) : false);

  // Keyboard shortcut label (1-9, then 0 for slot 10)
  const keyLabel = $derived(index < 9 ? String(index + 1) : "0");

  // Long-press tracking for clear action
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let isLongPress = false;

  function handlePointerDown() {
    if (isEmpty) return;

    isLongPress = false;
    longPressTimer = setTimeout(() => {
      isLongPress = true;
      onClear?.();
    }, 600);
  }

  function handlePointerUp() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // Only trigger click if it wasn't a long press
    if (!isLongPress) {
      handleClick();
    }
    isLongPress = false;
  }

  function handlePointerLeave() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleClick() {
    if (isEmpty) {
      onSave?.();
    } else {
      onSelect?.();
    }
  }
</script>

<button
  class="preset-chip"
  class:empty={isEmpty}
  class:selected
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  onpointercancel={handlePointerLeave}
  aria-label={isEmpty
    ? `Save to slot ${index + 1}`
    : isCatDog
      ? `Preset ${index + 1}: ${leftInfo?.label} and ${rightInfo?.label}`
      : `Preset ${index + 1}: ${leftInfo?.label}`}
  aria-pressed={!isEmpty && selected}
  title={isEmpty
    ? "Save current props"
    : isCatDog
      ? `${leftInfo?.label} / ${rightInfo?.label} (hold to clear)`
      : `${leftInfo?.label} (hold to clear)`}
>
  <!-- Keyboard badge (desktop only) -->
  {#if showKeyboardBadge}
    <span class="keyboard-badge">{keyLabel}</span>
  {/if}

  <!-- Content -->
  <span class="chip-content">
    {#if isEmpty}
      <span class="slot-number">{index + 1}</span>
      <i class="fas fa-plus empty-icon" aria-hidden="true"></i>
    {:else if isCatDog && leftInfo && rightInfo}
      <div class="dual-props">
        <img src={leftInfo.image} alt="" class="mini-prop" class:no-rotate={leftNoRotate} />
        <img src={rightInfo.image} alt="" class="mini-prop red" class:no-rotate={rightNoRotate} />
      </div>
    {:else if leftInfo}
      <img src={leftInfo.image} alt="" class="mini-prop single" class:no-rotate={leftNoRotate} />
    {/if}
  </span>

  <!-- Selection indicator -->
  {#if selected}
    <span class="selection-ring"></span>
  {/if}
</button>

<style>
  .preset-chip {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 1;
    padding: 6px;
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    box-sizing: border-box;
  }

  .preset-chip:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .preset-chip:active {
    transform: scale(0.95);
  }

  /* Empty slot styling */
  .preset-chip.empty {
    border-style: dashed;
    background: transparent;
  }

  .preset-chip.empty:hover {
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
    border-color: var(--theme-accent);
  }

  /* Selected state */
  .preset-chip.selected {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: var(--theme-accent);
    border-style: solid;
  }

  /* Selection ring animation */
  .selection-ring {
    position: absolute;
    inset: -4px;
    border: 2px solid var(--theme-accent);
    border-radius: 14px;
    opacity: 0.6;
    animation: pulse-ring 2s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes pulse-ring {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.02); }
  }

  /* Keyboard badge */
  .keyboard-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 6px;
    background: var(--theme-text-dim);
    font-size: 11px;
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, monospace;
    color: var(--theme-panel-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    opacity: 0.8;
    transition: opacity var(--duration-fast) ease;
  }

  .preset-chip:hover .keyboard-badge {
    opacity: 1;
  }

  .preset-chip.selected .keyboard-badge {
    background: var(--theme-accent);
    color: white;
    opacity: 1;
  }

  /* Chip content */
  .chip-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 100%;
    height: 100%;
  }

  .slot-number {
    position: absolute;
    top: 4px;
    left: 6px;
    font-size: 11px;
    font-weight: 700;
    color: var(--theme-text-dim);
    opacity: 0.8;
  }

  .empty-icon {
    font-size: 18px;
    color: var(--theme-text-dim);
    transition: color var(--duration-fast) ease;
  }

  .preset-chip.empty:hover .empty-icon {
    color: var(--theme-accent);
  }

  /* Mini prop icons - rotated vertical for better fit in cells */
  .mini-prop {
    width: 60%;
    height: 60%;
    max-width: 70px;
    max-height: 70px;
    object-fit: contain;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    pointer-events: none;
    transform: rotate(-90deg);
  }

  .mini-prop.no-rotate {
    transform: none;
  }

  .mini-prop.single {
    width: 65%;
    height: 65%;
    max-width: 80px;
    max-height: 80px;
  }

  .dual-props {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 100%;
    height: 100%;
  }

  .dual-props .mini-prop {
    width: 55%;
    height: 40%;
    max-width: 50px;
    max-height: 40px;
  }

  .dual-props .mini-prop.red {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3)) hue-rotate(125deg) saturate(1.2);
  }

  /* Focus state */
  .preset-chip:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .preset-chip {
      transition: none;
    }

    .preset-chip:active {
      transform: none;
    }

    .selection-ring {
      animation: none;
      opacity: 0.5;
    }
  }
</style>
