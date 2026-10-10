<!--
  BpmChips.svelte

  Unified BPM chip selector component

  Variants:
  - "full": Shows +/- buttons, tap tempo display, and preset chips (default)
  - "compact": Shows only preset chips with a "Custom" popover for fine adjustment
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    PLAYBACK_MAX_BPM,
    PLAYBACK_MIN_BPM,
  } from "$lib/shared/animation-engine/domain/constants/timing";
  import {
    NUMERIC_TEMPO_PRESETS,
    TEMPO_TAP_TIMEOUT_MS,
    calculateTapTempo,
    clampTempoBpm,
    recordTempoTap,
  } from "$lib/shared/animation-engine/domain/tempo-behavior";

  // Props
  let {
    bpm = $bindable(60),
    min = PLAYBACK_MIN_BPM,
    max = PLAYBACK_MAX_BPM,
    step = 1,
    variant = "full",
    onBpmChange,
  }: {
    bpm: number;
    min?: number;
    max?: number;
    step?: number;
    variant?: "full" | "compact";
    onBpmChange?: (bpm: number) => void;
  } = $props();

  // Tap tempo state (full variant only)
  let tapTimes: number[] = $state([]);
  let tapTimeout: ReturnType<typeof setTimeout> | null = null;

  // Custom popover state (compact variant only)
  let showCustomPopover = $state(false);
  let customButtonRef = $state<HTMLButtonElement | null>(null);
  let popoverX = $state(0);
  let popoverY = $state(0);

  // Derived
  let isPresetValue = $derived(NUMERIC_TEMPO_PRESETS.includes(bpm));

  // Handlers
  function selectPreset(presetBpm: number) {
    const newBpm = clampTempoBpm(presetBpm, min, max);
    bpm = newBpm;
    onBpmChange?.(newBpm);
    showCustomPopover = false;
  }

  function decreaseBpm() {
    const newBpm = clampTempoBpm(bpm - step, min, max);
    bpm = newBpm;
    onBpmChange?.(newBpm);
  }

  function increaseBpm() {
    const newBpm = clampTempoBpm(bpm + step, min, max);
    bpm = newBpm;
    onBpmChange?.(newBpm);
  }

  // Tap tempo handler (full variant)
  function handleTap() {
    const now = Date.now();

    if (tapTimeout !== null) {
      clearTimeout(tapTimeout);
    }

    tapTimes = recordTempoTap(tapTimes, now);

    const newBpm = calculateTapTempo(tapTimes, min, max);
    if (newBpm !== null) {
      bpm = newBpm;
      onBpmChange?.(newBpm);
    }

    tapTimeout = setTimeout(() => {
      tapTimes = [];
    }, TEMPO_TAP_TIMEOUT_MS);
  }

  onDestroy(() => {
    if (tapTimeout !== null) clearTimeout(tapTimeout);
  });

  // Custom popover toggle (compact variant)
  function toggleCustomPopover() {
    showCustomPopover = !showCustomPopover;
  }

  // Update popover position
  $effect(() => {
    if (showCustomPopover && customButtonRef) {
      const rect = customButtonRef.getBoundingClientRect();
      popoverX = rect.left + rect.width / 2;
      popoverY = rect.top - 8;
    }
  });

  // Close popover on outside click
  function handleDocumentClick(event: MouseEvent) {
    if (showCustomPopover) {
      const target = event.target as HTMLElement;
      const popover = document.querySelector(".bpm-custom-popover");
      if (
        popover &&
        customButtonRef &&
        !popover.contains(target) &&
        !customButtonRef.contains(target)
      ) {
        showCustomPopover = false;
      }
    }
  }

  $effect(() => {
    if (showCustomPopover) {
      let addListenerTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        document.addEventListener("click", handleDocumentClick);
        addListenerTimer = null;
      }, 0);
      return () => {
        if (addListenerTimer !== null) {
          clearTimeout(addListenerTimer);
        }
        document.removeEventListener("click", handleDocumentClick);
      };
    }
    return undefined;
  });
</script>

{#if variant === "full"}
  <!-- Full variant: +/- buttons + tap tempo display + chips -->
  <div class="bpm-chips-container">
    <div class="bpm-chips full">
      <div class="bpm-adjuster">
        <button
          class="adjust-btn"
          onclick={decreaseBpm}
          disabled={bpm <= min}
          aria-label={t("compose_decrease_bpm")}
          type="button"
        >
          <i class="fas fa-minus" aria-hidden="true"></i>
        </button>

        <button
          class="current-bpm"
          onclick={handleTap}
          type="button"
          aria-label={t("compose_tap_to_set_tempo")}
          title={t("compose_tap_tempo_hint")}
        >
          <span class="bpm-value">{bpm}</span>
          <span class="bpm-label">{tapTimes.length > 0 ? t("compose_tap") : t("compose_bpm")}</span>
        </button>

        <button
          class="adjust-btn"
          onclick={increaseBpm}
          disabled={bpm >= max}
          aria-label={t("compose_increase_bpm")}
          type="button"
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
        </button>
      </div>

      <div class="preset-chips">
        {#each NUMERIC_TEMPO_PRESETS as presetBpm}
          <button
            class="preset-chip"
            class:active={bpm === presetBpm}
            onclick={() => selectPreset(presetBpm)}
            type="button"
            aria-label={t("compose_set_bpm_to", { bpm: presetBpm })}
          >
            {presetBpm}
          </button>
        {/each}
      </div>
    </div>
  </div>
{:else}
  <!-- Compact variant: chips only + custom popover -->
  <div class="bpm-chips compact">
    {#each NUMERIC_TEMPO_PRESETS as presetBpm}
      <button
        class="preset-chip"
        class:active={bpm === presetBpm && !showCustomPopover}
        onclick={() => selectPreset(presetBpm)}
        type="button"
        aria-label={t("compose_set_bpm_to", { bpm: presetBpm })}
      >
        {presetBpm}
      </button>
    {/each}

    <button
      bind:this={customButtonRef}
      class="preset-chip custom-chip"
      class:active={!isPresetValue || showCustomPopover}
      onclick={toggleCustomPopover}
      type="button"
      aria-label={t("compose_custom_bpm")}
    >
      {!isPresetValue ? bpm : t("compose_custom")}
    </button>
  </div>

  {#if showCustomPopover}
    <div
      class="bpm-custom-popover"
      style="left: {popoverX}px; top: {popoverY}px;"
    >
      <div class="popover-header">{t("compose_custom_bpm")}</div>
      <div class="popover-controls">
        <button
          class="popover-btn"
          onclick={decreaseBpm}
          disabled={bpm <= min}
          aria-label={t("compose_decrease_bpm")}
          type="button"
        >
          <i class="fas fa-minus" aria-hidden="true"></i>
        </button>

        <div class="bpm-display">
          <span class="bpm-number">{bpm}</span>
          <span class="bpm-unit">{t("compose_bpm")}</span>
        </div>

        <button
          class="popover-btn"
          onclick={increaseBpm}
          disabled={bpm >= max}
          aria-label={t("compose_increase_bpm")}
          type="button"
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  {/if}
{/if}

<style>
  /* ===========================
     UNIFIED BPM CHIPS
     =========================== */

  .bpm-chips-container {
    container-type: inline-size;
    container-name: bpm-chips;
    width: 100%;
  }

  .bpm-chips {
    display: flex;
    width: 100%;
  }

  .bpm-chips.full {
    flex-direction: column;
    gap: 8px;
  }

  .bpm-chips.compact {
    gap: 6px;
    flex-wrap: nowrap;
    overflow: hidden;
  }

  /* Wide layout for full variant */
  @container bpm-chips (min-width: 540px) {
    .bpm-chips.full {
      flex-direction: row;
      align-items: center;
      gap: 12px;
    }

    .bpm-adjuster {
      flex-shrink: 0;
    }

    .preset-chips {
      flex: 1;
      min-width: 0;
    }
  }

  /* ===========================
     BPM ADJUSTER (full variant)
     =========================== */

  .bpm-adjuster {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .current-bpm {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 20px;
    min-width: 80px;
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    box-shadow:
      0 0 20px color-mix(in srgb, var(--theme-accent) 20%, transparent),
      inset 0 1px 0 var(--theme-stroke);
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .current-bpm:hover {
      background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
      border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
      transform: scale(1.02);
      box-shadow:
        0 0 24px color-mix(in srgb, var(--theme-accent) 30%, transparent),
        inset 0 1px 0 var(--theme-stroke);
    }
  }

  .current-bpm:active {
    transform: scale(0.98);
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  .bpm-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .bpm-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }


  .adjust-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 50%;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .adjust-btn:hover:not(:disabled) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
      transform: scale(1.05);
    }
  }

  .adjust-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .adjust-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }


  .preset-chips {
    display: flex;
    gap: 6px;
    width: 100%;
  }

  /* Six presets cannot keep honest touch targets in a phone-width popover.
     The canonical selector owns that responsive decision so every narrow host
     gets the same three-by-two layout instead of squeezing its own copy. */
  @container bpm-chips (max-width: 19rem) {
    .preset-chips {
      display: grid;
      grid-template-columns: repeat(3, minmax(var(--min-touch-target), 1fr));
    }
  }

  .preset-chip {
    flex: 1;
    min-width: 0;
    min-height: var(--min-touch-target);
    padding: 10px 8px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: clamp(0.75rem, 2.5vw, 0.85rem);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    font-variant-numeric: tabular-nums;
  }

  .preset-chip:active:not(:disabled) {
    transform: scale(0.97);
  }

  /* Active (selected) state */
  .preset-chip.active {
    background: color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
    color: white;
    box-shadow:
      0 0 20px color-mix(in srgb, var(--theme-accent) 25%, transparent),
      0 2px 8px color-mix(in srgb, var(--theme-accent) 20%, transparent),
      inset 0 1px 0 var(--theme-stroke);
  }

  @media (hover: hover) and (pointer: fine) {
    /* Hover for non-active chips only */
    .preset-chip:hover:not(:disabled):not(.active) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
      transform: translateY(-1px);
    }

    /* Hover for active chips - maintains accent with enhancement */
    .preset-chip.active:hover {
      background: color-mix(in srgb, var(--theme-accent) 35%, transparent);
      border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
      color: white;
      transform: translateY(-1px);
      box-shadow:
        0 0 24px color-mix(in srgb, var(--theme-accent) 30%, transparent),
        0 4px 12px color-mix(in srgb, var(--theme-accent) 25%, transparent),
        inset 0 1px 0 var(--theme-card-hover-bg);
    }
  }

  /* Custom chip (compact variant) */
  .custom-chip {
    flex: 0 0 auto;
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.2px;
    padding: 10px 12px;
    white-space: nowrap;
  }

  /* ===========================
     CUSTOM POPOVER (compact)
     =========================== */

  .bpm-custom-popover {
    position: fixed;
    transform: translate(-50%, -100%);
    z-index: var(--z-tooltip);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 2px solid color-mix(in srgb, var(--theme-accent) 80%, transparent);
    border-radius: 16px;
    padding: 12px;
    min-width: 200px;
    box-shadow:
      0 8px 32px color-mix(in srgb, black 50%, transparent),
      0 0 0 1px var(--theme-stroke),
      0 0 24px color-mix(in srgb, var(--theme-accent) 50%, transparent);
    animation: popoverSlide var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: auto;
  }

  @keyframes popoverSlide {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-100% - 8px));
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%);
    }
  }

  .popover-header {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 4px 8px;
    border-bottom: 1px solid var(--theme-stroke);
    margin-bottom: 8px;
  }

  .popover-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .popover-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 50%;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    font-size: var(--font-size-compact, 12px);
  }

  @media (hover: hover) and (pointer: fine) {
    .popover-btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
      border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
      color: white;
      box-shadow:
        0 2px 8px color-mix(in srgb, var(--theme-accent) 20%, transparent),
        inset 0 1px 0 var(--theme-stroke);
    }
  }

  .popover-btn:active:not(:disabled) {
    transform: scale(0.93);
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }

  .popover-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .bpm-display {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-radius: 10px;
  }

  .bpm-number {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--theme-text);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .bpm-unit {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }


  @media (max-width: 480px) {
    .adjust-btn {
      width: 44px;
      height: 44px;
      font-size: var(--font-size-compact, 12px);
    }

    .preset-chip {
      min-height: 44px;
      padding: 8px 6px;
      font-size: var(--font-size-compact, 12px);
    }
  }


  @media (prefers-reduced-motion: reduce) {
    .adjust-btn,
    .preset-chip,
    .popover-btn,
    .bpm-custom-popover,
    .current-bpm {
      transition: none;
      animation: none;
    }

    .adjust-btn:hover,
    .adjust-btn:active,
    .preset-chip:hover,
    .preset-chip:active,
    .current-bpm:hover,
    .current-bpm:active {
      transform: none;
    }
  }
</style>
