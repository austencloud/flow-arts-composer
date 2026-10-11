<!--
LengthCard.svelte - Unified sequence length selection card
Uses shared StepperCard for consistent styling with Generate module
Can operate as stepper (inline) or panel opener (click to select)
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { attachRipple } from "#lib/shared/application/services/ripple-effect.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";
  import StepperCard from "#lib/shared/components/stepper-card/StepperCard.svelte";

  type LengthCardMode = "stepper" | "panel-opener";

  let {
    value = null,
    mode = "stepper",
    min = 4,
    max = 64,
    step = 4,
    allowNull = true,
    disabled = false,
    gridColumnSpan = 2,
    cardIndex = 0,
    onChange,
    onOpenSheet,
  }: {
    value?: number | null;
    mode?: LengthCardMode;
    min?: number;
    max?: number;
    step?: number;
    allowNull?: boolean;
    disabled?: boolean;
    gridColumnSpan?: number;
    cardIndex?: number;
    onChange?: (length: number | null) => void;
    onOpenSheet?: () => void;
  } = $props();

  let hapticService: HapticFeedback | null = null;
  let cardElement: HTMLDivElement | null = $state(null);

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;

    if (mode === "panel-opener" && cardElement) {
      return attachRipple(cardElement, {
        color: "rgba(255, 255, 255, 0.25)",
        duration: 350,
        opacity: 0.15,
      });
    }
    return undefined;
  });

  // For stepper mode - use 0 to represent "any"
  const currentValue = $derived(value ?? 0);
  const minValue = $derived(allowNull ? 0 : min);

  function handleIncrement() {
    if (disabled || mode !== "stepper" || !onChange) return;
    if (value === null) {
      onChange(min);
    } else if (value < max) {
      onChange(value + step);
    } else if (allowNull) {
      onChange(null);
    }
  }

  function handleDecrement() {
    if (disabled || mode !== "stepper" || !onChange) return;
    if (value === null) {
      onChange(max);
    } else if (value > min) {
      onChange(value - step);
    } else if (allowNull) {
      onChange(null);
    }
  }

  function formatValue(val: number): string {
    if (val === 0) return t("shared_controls_any_length");
    return val.toString();
  }

  function handleCardClick() {
    if (disabled || mode !== "panel-opener" || !onOpenSheet) return;
    hapticService?.trigger("selection");
    onOpenSheet();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (
      mode === "panel-opener" &&
      !disabled &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      handleCardClick();
    }
  }

  const displayValue = $derived(
    value
      ? t("shared_controls_step_count", { count: value })
      : t("shared_controls_any_length")
  );
</script>

{#if mode === "stepper"}
  <StepperCard
    title={t("shared_controls_length")}
    {currentValue}
    {minValue}
    maxValue={max}
    onIncrement={handleIncrement}
    onDecrement={handleDecrement}
    {formatValue}
    color="radial-gradient(ellipse at top left, var(--semantic-info) 0%, var(--semantic-info) 40%, #1d4ed8 100%)"
    shadowColor="220deg 80% 55%"
    {gridColumnSpan}
    {cardIndex}
  />
{:else}
  <!-- Panel opener mode -->
  <div
    bind:this={cardElement}
    class="length-card panel-opener"
    class:disabled
    role="button"
    tabindex={disabled ? -1 : 0}
    onclick={handleCardClick}
    onkeydown={handleKeydown}
    aria-label={t("shared_controls_change_length", { length: displayValue })}
    style="--card-index: {cardIndex}; grid-column: span {gridColumnSpan};"
  >
    <div class="card-header">
      <span class="card-title">{t("shared_controls_length")}</span>
    </div>

    <div class="length-display">
      <span class="length-value">{displayValue}</span>
    </div>

    <div class="click-indicator" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </div>
  </div>
{/if}

<style>
  .length-card {
    container-type: size;
    container-name: length-card;

    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;

    height: 100%;
    min-height: 80px;
    min-width: 0;

    padding: clamp(6px, 2cqh, 12px) clamp(4px, 1.5cqw, 8px);

    border-radius: 16px;
    background: radial-gradient(
      ellipse at top left,
      var(--semantic-warning) 0%,
      var(--semantic-warning) 40%,
      #d97706 100%
    );
    border: none;
    color: white;
    text-align: center;

    box-shadow:
      0 1px 2px hsl(38deg 92% 50% / 0.15),
      0 2px 4px hsl(38deg 92% 50% / 0.12),
      0 4px 8px hsl(38deg 92% 50% / 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);

    transition:
      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: visible;
    cursor: pointer;

    animation: cardEnter var(--duration-dramatic) ease-out;
  }

  .length-card.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .length-card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.3) 0%,
      rgba(255, 255, 255, 0.15) 40%,
      var(--theme-card-bg) 70%,
      rgba(255, 255, 255, 0) 100%
    );
    border-radius: 16px 16px 0 0;
    pointer-events: none;
    z-index: 1;
  }

  @media (hover: hover) {
    .length-card:hover {
      transform: scale(1.02);
      filter: brightness(1.05);
      box-shadow:
        0 2px 4px hsl(38deg 92% 50% / 0.12),
        0 4px 8px hsl(38deg 92% 50% / 0.1),
        0 8px 16px hsl(38deg 92% 50% / 0.08),
        0 16px 24px hsl(38deg 92% 50% / 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }
  }

  .length-card:active {
    transform: scale(0.97);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .length-card:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.6);
    outline-offset: 3px;
  }

  @keyframes cardEnter {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .card-header {
    position: relative;
    z-index: 2;
    width: 100%;
    padding: clamp(3px, 0.8cqh, 6px) clamp(6px, 1.5cqw, 10px);
  }

  .card-title {
    font-size: clamp(8px, 2.5cqi, 11px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    opacity: 0.9;
  }

  .length-display {
    position: relative;
    z-index: 2;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .length-value {
    font-size: clamp(16px, 5cqw, 28px);
    font-weight: 700;
    letter-spacing: 0.3px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    white-space: nowrap;
  }

  .click-indicator {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 20px;
    height: 20px;
    color: var(--theme-text-dim);
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
    z-index: 2;
  }

  @media (hover: hover) {
    .length-card:hover .click-indicator {
      opacity: 1;
    }
  }

  .click-indicator svg {
    width: 100%;
    height: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .length-card {
      animation: none;
      transition: none;
    }
  }
</style>
